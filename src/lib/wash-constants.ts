export const WASH_COMPANIES = ["DFDS", "DSV"] as const;
export type WashCompany = (typeof WASH_COMPANIES)[number];
