import { Schemas } from '@mojaloop/api-snippets/lib/fspiop/v1_1';

export interface IPartyResult extends Schemas.PartiesTypeIDPutResponse {
    errorInformation?: Schemas.ErrorInformation;
}
