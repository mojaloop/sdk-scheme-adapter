class KafkaDomainEventConsumer {
    constructor(...args) {
        KafkaDomainEventConsumer.mock = {
            ctor: jest.fn(),
            start: jest.fn(),
            init: jest.fn(),
            destroy: jest.fn(),
        };
        KafkaDomainEventConsumer.mock.ctor(...args);
    }
    init(...args) {
        KafkaDomainEventConsumer.mock.init(...args);
    }
    start(...args) {
        KafkaDomainEventConsumer.mock.start(...args);
    }
    destroy(...args) {
        KafkaDomainEventConsumer.mock.destroy(...args);
    }
}

class KafkaDomainEventProducer {
    constructor(...args) {
        KafkaDomainEventProducer.mock = {
            ctor: jest.fn(),
            init: jest.fn(),
            start: jest.fn(),
            destroy: jest.fn(),
            sendDomainEvent: jest.fn(),
        };
        KafkaDomainEventProducer.mock.ctor(...args);
    }
    init(...args) {
        KafkaDomainEventProducer.mock.init(...args);
    }
    start(...args) {
        KafkaDomainEventProducer.mock.start(...args);
    }
    destroy(...args) {
        KafkaDomainEventProducer.mock.destroy(...args);
    }
    sendDomainEvent(...args) {
        KafkaDomainEventProducer.mock.sendDomainEvent(...args);
    }
}


module.exports = {
    ...jest.requireActual('@mojaloop/sdk-scheme-adapter-private-shared-lib'),
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
};
