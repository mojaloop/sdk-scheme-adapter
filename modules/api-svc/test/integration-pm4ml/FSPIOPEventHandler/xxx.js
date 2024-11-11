const { DefaultLogger } = require('@mojaloop/logging-bc-client-lib');
const {
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const logger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

// Setup for Kafka Producer
const domainEventProducerOptions = {
    brokerList: 'localhost:9092',
    clientId: 'test-integration-client-id',
    topic: 'topic-sdk-outbound-domain-events'
};
const producer = new KafkaDomainEventProducer(domainEventProducerOptions, logger);

// Setup for Kafka Consumer
const domainEventConsumerOptions = {
    brokerList: 'localhost:9092',
    clientId: 'test-integration-client-id2',
    topics: ['topic-sdk-outbound-domain-events'],
    groupId: 'test-integration-group-id'
};

let domainEvents = [];
const _messageHandler = async (message) => {
    domainEvents.push(message);
};
const consumer = new KafkaDomainEventConsumer(_messageHandler.bind(this), domainEventConsumerOptions, logger);

const start = async () => {
    try {
        await producer.init();

        await consumer.init()
            .catch(err => {
                console.error('Error in consumer.init', err);
                throw err;
            });
        await consumer.start();
    } catch (e) {
        console.log('Error in setting up producer and consumer', e);
    }
    console.log('Producer and consumer started');

    await producer.destroy();
    await consumer.destroy();

    console.log('Everything is ok!');
};

start().catch(console.error);
