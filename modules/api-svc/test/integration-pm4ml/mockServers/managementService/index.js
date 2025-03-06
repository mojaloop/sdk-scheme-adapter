const express = require('express');
const { createLogger } = require('../../../../src/lib/logger');
const Config = require('./config');
const ManagementService = require('./server');

const app = express();

const logger = createLogger({
    context: {
        simulator: 'test',
        hostname: 'test',
    }
});

const managementServer = new ManagementService.Server({
    port: Config.server.port,
    logger: logger,
});

// Test API Server
app.use(express.json());

app.get('/health', (req, res) => {
    res.send('OK');
});

app.post('/updateOutboundTLSConfig', (req, res) => {
    managementServer.updateOutboundTLSConfig(req.body);
    res.status(200).json({
        message: 'Updated configuration'
    });
});

app.post('/resetConfig', (req, res) => {
    managementServer.resetConfig();
    res.status(200).json({
        message: 'Reset Done'
    });
});

app.listen(Config.testAPIServer.port, () => {
    logger.log(`Test API Server listening on port ${Config.testAPIServer.port}`);
});
