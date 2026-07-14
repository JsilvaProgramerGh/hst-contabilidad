export type QuoteCompanyProfile = {
  id: string;
  name: string;
  ruc: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  accent_blue: string;
};

export const DEFAULT_QUOTE_COMPANY_PROFILE: QuoteCompanyProfile = {
  id: "default",
  name: "HST GLOBAL STORE",
  ruc: "0962974689001",
  address: "Direccion: Quevedo, calle guatemala y chile",
  city: "Ecuador",
  phone: "WhatsApp: 0982124443",
  email: "Email: ventas@hstglobalstore.com",
  website: "",
  logo_url: "/logo.png",
  accent_blue: "#105fff",
};

export function mapQuoteCompanyProfile(row: Partial<QuoteCompanyProfile> | null | undefined): QuoteCompanyProfile {
  return {
    id: row?.id || DEFAULT_QUOTE_COMPANY_PROFILE.id,
    name: row?.name || DEFAULT_QUOTE_COMPANY_PROFILE.name,
    ruc: row?.ruc || DEFAULT_QUOTE_COMPANY_PROFILE.ruc,
    address: row?.address || DEFAULT_QUOTE_COMPANY_PROFILE.address,
    city: row?.city || DEFAULT_QUOTE_COMPANY_PROFILE.city,
    phone: row?.phone || DEFAULT_QUOTE_COMPANY_PROFILE.phone,
    email: row?.email || DEFAULT_QUOTE_COMPANY_PROFILE.email,
    website: row?.website || DEFAULT_QUOTE_COMPANY_PROFILE.website,
    logo_url: row?.logo_url || DEFAULT_QUOTE_COMPANY_PROFILE.logo_url,
    accent_blue: row?.accent_blue || DEFAULT_QUOTE_COMPANY_PROFILE.accent_blue,
  };
}
