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
    name: row?.name ?? "",
    ruc: row?.ruc ?? "",
    address: row?.address ?? "",
    city: row?.city ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    website: row?.website ?? "",
    logo_url: row?.logo_url ?? "",
    accent_blue: row?.accent_blue || DEFAULT_QUOTE_COMPANY_PROFILE.accent_blue,
  };
}
