import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
export interface IPartyResult {
    party?: SDKSchemeAdapter.V2_0_0.Outbound.Types.Party;
    errorInformation?: SDKSchemeAdapter.V2_0_0.Outbound.Types.ErrorInformation;
    currentState: SDKSchemeAdapter.V2_0_0.Outbound.Types.partiesByIdResponse['currentState'];
}
