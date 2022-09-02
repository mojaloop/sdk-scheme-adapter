import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
export interface IPartyResult {
    party?: SDKSchemeAdapter.Outbound.V2_0_0.Types.Party;
    errorInformation?: SDKSchemeAdapter.Outbound.V2_0_0.Types.ErrorInformation;
    currentState: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse['currentState'];
}
