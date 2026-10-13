import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailLink, TextWithEmails, emailLinkHtml } from "./EmailLink";

describe("EmailLink", () => {
  it("wraps the link in Cloudflare's email_off markers", () => {
    const html = emailLinkHtml("hello@farelune.com", "x");
    expect(html).toBe(
      '<!--email_off--><a href="mailto:hello@farelune.com" class="x">hello@farelune.com</a><!--/email_off-->',
    );
  });

  it("escapes values and refuses non-addresses", () => {
    expect(emailLinkHtml('a"b@c.com', 'y"><script>')).not.toContain("<script>");
    const { container } = render(<EmailLink email="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("links every address inside a sentence and keeps the punctuation", () => {
    const { container } = render(
      <p>
        <TextWithEmails text="Write to privacy@farelune.com. Or hello@farelune.com!" />
      </p>,
    );
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["mailto:privacy@farelune.com", "mailto:hello@farelune.com"]);
    expect(container.textContent).toBe("Write to privacy@farelune.com. Or hello@farelune.com!");
  });
});
