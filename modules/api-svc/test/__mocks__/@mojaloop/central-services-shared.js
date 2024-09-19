const components = jest.requireActual('@mojaloop/central-services-shared');
const { Util: {id: idGenerator} } = require('@mojaloop/central-services-shared');

let id = idGenerator({ type: 'ulid' });

components.Util.id = () => () => id(1);
components.Util.id.__reset = () => { idGenerator({ type: 'ulid' }); };

module.exports = components;
