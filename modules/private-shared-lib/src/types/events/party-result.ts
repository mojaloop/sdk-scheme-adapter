import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface IPartyResult extends SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse {
    errorInformation?: SDKSchemeAdapter.Outbound.V2_0_0.Types.ErrorInformation;
}

