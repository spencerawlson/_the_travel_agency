import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/utils";
import { LoginForm } from "./LoginForm";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

async function signIn() {
  await userEvent.type(screen.getByLabelText("Email"), "admin@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm two-step sign-in", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
  });

  it("asks for a code after the password, then sends both", async () => {
    apiFetch
      .mockRejectedValueOnce(new ApiError(401, "otp_required", "code needed"))
      .mockResolvedValueOnce({});
    renderWithIntl(<LoginForm />);
    await signIn();
    const code = await screen.findByLabelText("Code from your authenticator app");
    await waitFor(() => expect(code).toHaveFocus());
    await userEvent.type(code, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
    expect(apiFetch.mock.calls[1]?.[1]).toMatchObject({
      body: { email: "admin@example.com", password: "secret", otp: "123456" },
    });
  });

  it("explains a wrong code and keeps the code step", async () => {
    apiFetch
      .mockRejectedValueOnce(new ApiError(401, "otp_required", "code needed"))
      .mockRejectedValueOnce(new ApiError(401, "invalid_otp", "bad code"));
    renderWithIntl(<LoginForm />);
    await signIn();
    await userEvent.type(
      await screen.findByLabelText("Code from your authenticator app"),
      "000000",
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work");
    expect(screen.getByLabelText("Code from your authenticator app")).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });
});
