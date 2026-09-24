/**
 * Read login field values from the live form DOM.
 * iOS Safari / password managers often fill inputs without updating React controlled state.
 */
export type LoginFormValues = {
  email: string;
  password: string;
  diag: {
    emailLength: number;
    passwordLength: number;
    emailHadWhitespace: boolean;
    passwordHadWhitespace: boolean;
    emailStateMatchesDom: boolean;
    passwordStateMatchesDom: boolean;
  };
};

function inputValue(el: unknown): string | null {
  if (el && typeof el === "object" && "value" in el && typeof (el as { value: unknown }).value === "string") {
    return (el as { value: string }).value;
  }
  return null;
}

export function readLoginFormValues(
  form: HTMLFormElement,
  reactEmail: string,
  reactPassword: string,
): LoginFormValues {
  const emailNamed = form.elements.namedItem("email");
  const passwordNamed = form.elements.namedItem("password");
  const emailDom =
    inputValue(emailNamed) ??
    inputValue(form.querySelector?.("#email, input[type='email']")) ??
    reactEmail;
  const passwordDom =
    inputValue(passwordNamed) ??
    inputValue(form.querySelector?.("#password, input[type='password']")) ??
    reactPassword;

  return {
    email: emailDom,
    password: passwordDom,
    diag: {
      emailLength: emailDom.length,
      passwordLength: passwordDom.length,
      emailHadWhitespace: emailDom !== emailDom.trim(),
      passwordHadWhitespace: passwordDom !== passwordDom.trim(),
      emailStateMatchesDom: emailDom === reactEmail,
      passwordStateMatchesDom: passwordDom === reactPassword,
    },
  };
}
