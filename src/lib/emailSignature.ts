/**
 * Canonical ThreeFold customer-facing email identity, closing, and HTML signature.
 *
 * TF_FROM_ADDRESS   — primary company email address.
 * TF_FROM_HEADER    — RFC 5322 From header (name + address) for all outbound emails.
 * TF_PLAIN_CLOSING  — plain-text closing for Gmail compose / mailto bodies.
 * TF_SIGNATURE_HTML — exact HTML signature block for rendered Resend / Gmail API emails.
 *
 * To update the signature, change it here; all email templates inherit the change.
 */

export const TF_FROM_ADDRESS = "info@threefoldsupply.com";
export const TF_FROM_HEADER  = "ThreeFold Supply Co. <info@threefoldsupply.com>";

export const TF_PLAIN_CLOSING = "Best,\n\nThreeFold Supply Company";

// ── Shared HTML email template ────────────────────────────────────────────────
//
// Single source of truth for the branded wrapper + signature appended to every
// customer-facing ThreeFold email. Import wrapInEmailTemplate instead of
// defining a local copy — local copies will drift and lose the signature.

function _toHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");
}

/**
 * Wraps a plain-text email body in the ThreeFold branded HTML template and
 * appends the exact HTML signature block.
 *
 * Pass plain text — HTML escaping and newline → <br> conversion happen
 * internally. The returned string is safe to pass directly to Gmail API or
 * Resend as the `html` field.
 */
export function wrapInEmailTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:48px 32px 64px;">
  <div style="font-size:11px;font-weight:800;letter-spacing:0.22em;color:#0a0a0a;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;letter-spacing:0.08em;color:#6F685D;margin-bottom:32px;">Made by three, worn by all.</div>
  <div style="height:1px;background:#DDD6CB;margin-bottom:32px;"></div>
  <div style="font-size:15px;color:#332E28;line-height:1.75;">
    ${_toHtml(body)}
  </div>
  <div style="margin-top:32px;">
    ${TF_SIGNATURE_HTML}
  </div>
  <div style="height:1px;background:#DDD6CB;margin-top:40px;margin-bottom:24px;"></div>
  <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;color:#756D62;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;color:#7F776B;letter-spacing:0.06em;">Made by three, worn by all.</div>
</div>
</body>
</html>`;
}

export const TF_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia;"><tbody><tr><td style="padding-bottom: 16px;"><img alt="Handwritten Signature" role="presentation" src="https://esg.hubwt.com/prod/2c03ba5f-f4e2-f9bc-9570-ca9452d537dc-1779315445177.png" height="50" data-cy="handwritten-signature-blob" style="display: block; height: 50px;"></td></tr><tr><td><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia;"><tbody><tr><td style="vertical-align: top;"><h2 style="margin: 0px; font-size: 16px; font-family: Georgia; color: rgb(0, 0, 0); font-weight: 600; line-height: 24px;"><span>ThreeFold</span><span>&nbsp;</span><span>Supply Co.</span></h2><p style="margin: 0px; color: rgb(0, 0, 0); font-size: 12px; line-height: 20px;"><span>Custom Branded Apparel</span></p><div style="margin: 0px; font-weight: 500; color: rgb(0, 0, 0); font-size: 12px; line-height: 20px;"><span>Made By Three, Worn By All</span></div><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia; width: 100%;"><tbody><tr><td height="24" aria-label="Horizontal Spacer"></td></tr><tr><td width="auto" aria-label="Divider" style="width: 100%; height: 1px; border-bottom: 1px solid rgb(255, 207, 0); border-left-width: medium; border-left-style: none; border-left-color: currentcolor; display: block;"></td></tr><tr><td height="24" aria-label="Horizontal Spacer"></td></tr></tbody></table><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia; line-height: 1;"><tbody><tr style="vertical-align: middle; height: 26px;"><td width="24" style="vertical-align: middle;"><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia; width: 24px;"><tbody><tr><td style="vertical-align: bottom;"><span style="display: inline-block; background-color: rgb(255, 207, 0);"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/phone-icon-dark-2x.png" alt="mobilePhone" width="16" style="display: block; background-image: linear-gradient(rgb(255, 207, 0), rgb(255, 207, 0));"></span></td></tr></tbody></table></td><td style="padding: 0px; color: rgb(0, 0, 0);"><a href="tel:(408) 981-2038" style="text-decoration: none; color: rgb(0, 0, 0); font-size: 12px;"><span>(408) 981-2038</span></a></td></tr><tr style="vertical-align: middle; height: 26px;"><td width="24" style="vertical-align: middle;"><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia; width: 24px;"><tbody><tr><td style="vertical-align: bottom;"><span style="display: inline-block; background-color: rgb(255, 207, 0);"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/email-icon-dark-2x.png" alt="emailAddress" width="16" style="display: block; background-image: linear-gradient(rgb(255, 207, 0), rgb(255, 207, 0));"></span></td></tr></tbody></table></td><td style="padding: 0px; color: rgb(0, 0, 0);"><a href="mailto:info@threefoldsupply.com" style="text-decoration: none; color: rgb(0, 0, 0); font-size: 12px;"><span>info@threefoldsupply.com</span></a></td></tr><tr style="vertical-align: middle; height: 26px;"><td width="24" style="vertical-align: middle;"><table cellpadding="0" cellspacing="0" border="0" style="vertical-align: -webkit-baseline-middle; font-size: small; font-family: Georgia; width: 24px;"><tbody><tr><td style="vertical-align: bottom;"><span style="display: inline-block; background-color: rgb(255, 207, 0);"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/link-icon-dark-2x.png" alt="website" width="16" style="display: block; background-image: linear-gradient(rgb(255, 207, 0), rgb(255, 207, 0));"></span></td></tr></tbody></table></td><td style="padding: 0px; color: rgb(0, 0, 0);"><a href="https://threefoldsupply.com" style="text-decoration: none; color: rgb(0, 0, 0); font-size: 12px;"><span>threefoldsupply.com</span></a></td></tr></tbody></table></td><td width="45" aria-label="Vertical Spacer"><div style="width: 45px;"></div></td></tr></tbody></table></td></tr><tr><td height="24" aria-label="Horizontal Spacer"></td></tr><tr><td colspan="3" style="max-width: 300px; font-size: 12px; padding-top: 1rem; text-align: left;"><div class="legal-content"><p style="font-size: inherit; margin: 0px;"></p><p style="font-size: inherit; margin: 0px;"></p><p style="font-size: inherit; margin: 0px;"></p></div></td></tr></tbody></table>`;
