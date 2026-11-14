import type { CustomerSessionVerifier } from "../src/customer-session.js";

export const subjectId = "e6abf26a-3263-4149-9d75-9b7441165d29";
export const otherSubjectId = "0f6e8a35-8f2b-4b9b-9a8b-1f9b2a3c4d5e";
export const workspaceId = "f6399f75-b398-41cd-a299-92b6d236c1fd";
export const touchpointId = "31f7a4dc-0bb7-450e-91c6-342045d779e9";
export const experienceId = "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22";
export const versionId = "1a2b3c4d-5e6f-4708-8a9b-0c1d2e3f4a5b";
export const assetId = "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c";
export const profileId = "3c4d5e6f-7081-492a-8c1d-2e3f4a5b6c7d";
export const invitationId = "4d5e6f70-8192-4a3b-9d2e-3f4a5b6c7d8e";

export function verifierFor(
  identity: { subject: string; email: string } = {
    subject: subjectId,
    email: "customer@kardo.test",
  },
): CustomerSessionVerifier {
  return {
    verify: async () => identity,
  };
}

export const authHeader = { authorization: "Bearer test" };
