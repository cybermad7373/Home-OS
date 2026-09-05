/**
 * Who operates this deployment, and where to write to them.
 *
 * Three of the launch-gate items — a real contact address on the terms page, on
 * the privacy page, and on support — are the same fact, and it is a fact about
 * the operator rather than about the software. So it is configuration, read
 * from the environment, and every page that needs it asks here.
 *
 * `configured` is false until all three are set, and each page renders its
 * marked placeholder instead. That is deliberate: a legal page carrying an
 * invented company name and address is a fabricated record, and shipping one by
 * accident should be obvious rather than subtle.
 *
 * These are `NEXT_PUBLIC_` because they are printed on public pages. Nothing
 * here is a secret; a support address that nobody can find is not a support
 * address.
 */

export interface LegalContact {
  configured: boolean;
  entity: string;
  address: string;
  email: string;
}

export function legalContact(): LegalContact {
  const entity = (process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? "").trim();
  const address = (process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "").trim();
  const email = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();

  return {
    // The address is the one part a self-hosted household may legitimately not
    // have. A name and somewhere to write are the floor.
    configured: Boolean(entity && email),
    entity,
    address,
    email,
  };
}
