// https://stackoverflow.com/a/15964759/25868

export type BasicEventHandler = () => void;
export type SenderEventHandler<SenderT> = (sender: SenderT) => void;

//
// Simulate C# style events in JS.
//
export interface IEventSource<HandlerType extends Function> {
    //
    // Attach a handler for this event.
    //
    attach(handler: HandlerType): void;

    //
    // Detach a handler for this event.
    //
    detach(handler: HandlerType): void;

    //
    // Raise the event.
    //
    /*async*/ raise(...args: any[]): Promise<void>;
};


//
// Simulate C# style events in JS.
//
export class EventSource<HandlerType extends Function> implements IEventSource<HandlerType> {

    //
    // Registered handlers for the event.
    //
    private handlers: Set<HandlerType> = new Set<HandlerType>();

    //
    // Attach a handler for this event.
    //
    attach(handler: HandlerType): void {
        this.handlers.add(handler);
        
    }

    //
    // Detach a handler for this event.
    //
    detach(handler: HandlerType): void {
        this.handlers.delete(handler);
    }

    //
    // Raise the event.
    //
    async raise(...args: any[]): Promise<void> {
        for (const handler of this.handlers) {
            await handler.apply(null, args);
        }
    }
}