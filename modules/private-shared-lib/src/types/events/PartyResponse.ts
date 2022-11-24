import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
export interface PartyResponse {
    party?: SDKSchemeAdapter.V2_0_0.Outbound.Types.Party;
    currentState: SDKSchemeAdapter.V2_0_0.Outbound.Types.partiesByIdResponse['currentState'];
}
