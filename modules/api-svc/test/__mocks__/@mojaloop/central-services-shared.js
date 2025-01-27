const components = jest.requireActual('@mojaloop/central-services-shared');

let id = 0;

components.Util.id = () => () => (++id).toString().padStart(26, '0');
components.Util.id.__reset = () => { id = 0; };

module.exports = components;
