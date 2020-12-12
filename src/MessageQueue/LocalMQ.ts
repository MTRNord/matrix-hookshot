import { EventEmitter } from "events";
import { MessageQueue, MessageQueueMessage, DEFAULT_RES_TIMEOUT } from "./MessageQueue";
import micromatch from "micromatch";
import {v4 as uuid} from "uuid";

export class LocalMQ extends EventEmitter implements MessageQueue {
    private subs: Set<string>;
    constructor() {
        super();
        this.subs = new Set();
    }

    public subscribe(eventGlob: string) {
        this.subs.add(eventGlob);
    }

    public unsubscribe(eventGlob: string) {
        this.subs.delete(eventGlob);
    }

    public async push<T>(message: MessageQueueMessage<T>) {
        if (!micromatch.match([...this.subs], message.eventName)) {
            return;
        }
        if (!message.messageId) {
            message.messageId = uuid();
        }
        this.emit(message.eventName, message);
    }

    public async pushWait<T, X>(message: MessageQueueMessage<T>,
                                timeout: number = DEFAULT_RES_TIMEOUT): Promise<X> {
        let resolve: (value: X) => void;
        let timer: NodeJS.Timer;

        const p = new Promise<X>((res, rej) => {
            resolve = res;
            timer = setTimeout(() => {
                rej(new Error("Timeout waiting for message queue response"));
            }, timeout);
        });

        const awaitResponse = (response: MessageQueueMessage<X>) => {
            if (response.messageId === message.messageId) {
                clearTimeout(timer);
                this.removeListener(`response.${message.eventName}`, awaitResponse);
                resolve(response.data);
            }
        };

        this.addListener(`response.${message.eventName}`, awaitResponse);
        this.push(message);
        return p;
    }
}
