import { Fragment } from "react";

/**
 * Email addresses wrapped in Cloudflare's documented opt-out markers
 * (<!--email_off--> ... <!--/email_off-->). Without them, Cloudflare's "Email
 * Address Obfuscation" rewrites addresses to "[email protected]" and injects a
 * decoder script that our nonce-based CSP (correctly) blocks, so visitors would
 * never see the address. HTML comments can only be emitted as raw HTML, so the
 * link is built here with every value escaped.
 */
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EMAIL_IN_TEXT = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLinkHtml(email: string, className = ""): string {
  const e = escapeHtml(email);
  const cls = className ? ` class="${escapeHtml(className)}"` : "";
  return `<!--email_off--><a href="mailto:${e}"${cls}>${e}</a><!--/email_off-->`;
}

export function EmailLink({ email, className }: { email: string; className?: string }) {
  if (!EMAIL.test(email)) return <span className={className}>{email}</span>;
  return <span dangerouslySetInnerHTML={{ __html: emailLinkHtml(email, className) }} />;
}

/** Plain text in which any email address becomes a protected mailto link. */
export function TextWithEmails({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const parts = text.split(EMAIL_IN_TEXT);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <EmailLink key={i} email={part} className={linkClassName} />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
