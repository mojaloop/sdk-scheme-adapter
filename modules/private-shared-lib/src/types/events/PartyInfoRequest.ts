import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export type PartyInfoRequest = {
    partyIdType: SDKSchemeAdapter.V2_0_0.Outbound.Types.PartyIdType;
    partyIdentifier: SDKSchemeAdapter.V2_0_0.Outbound.Types.PartyIdentifier;
    partySubIdOrType?: SDKSchemeAdapter.V2_0_0.Outbound.Types.PartySubIdOrType | undefined;
};
