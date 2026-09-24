import { describe, expect, it } from "vitest";
import { readLoginFormValues } from "@/lib/login-form";

function fakeForm(emailDom: string, passwordDom: string): HTMLFormElement {
  const email = { value: emailDom } as HTMLInputElement;
  const password = { value: passwordDom } as HTMLInputElement;
  return {
    elements: {
      namedItem(name: string) {
        if (name === "email") return email;
        if (name === "password") return password;
        return null;
      },
    },
  } as unknown as HTMLFormElement;
}

describe("readLoginFormValues", () => {
  it("prefers DOM values when React state lags behind autofill", () => {
    const result = readLoginFormValues(
      fakeForm("admin@guesthouse.local", "ActualPasswordFromDom!!"),
      "admin@guesthouse.local",
      "",
    );
    expect(result.password).toBe("ActualPasswordFromDom!!");
    expect(result.diag.passwordStateMatchesDom).toBe(false);
    expect(result.diag.emailStateMatchesDom).toBe(true);
  });

  it("reports whitespace without exposing the password", () => {
    const result = readLoginFormValues(
      fakeForm(" admin@guesthouse.local ", "  secret-password  "),
      " admin@guesthouse.local ",
      "  secret-password  ",
    );
    expect(result.diag.emailHadWhitespace).toBe(true);
    expect(result.diag.passwordHadWhitespace).toBe(true);
    expect(result.diag.passwordLength).toBe("  secret-password  ".length);
  });
});
