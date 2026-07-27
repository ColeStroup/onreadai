export type EntitlementActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialEntitlementActionState: EntitlementActionState = {
  status: "idle",
  message: "",
};
