const components = jest.requireActual('@mojaloop/central-services-shared');

let id = 0;

components.Util.id = () => () => `00000000-0000-1000-8000-${(++id).toString().padStart(12, '0')}`;
components.Util.id.__reset = () => { id = 0; };

module.exports = components;
