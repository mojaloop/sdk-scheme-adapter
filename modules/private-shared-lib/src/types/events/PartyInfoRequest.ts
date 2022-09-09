import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export type PartyInfoRequest = {
    partyIdType: SDKSchemeAdapter.Outbound.V2_0_0.Types.PartyIdType;
    partyIdentifier: SDKSchemeAdapter.Outbound.V2_0_0.Types.PartyIdentifier;
    partySubIdOrType?: SDKSchemeAdapter.Outbound.V2_0_0.Types.PartySubIdOrType | undefined;
};
