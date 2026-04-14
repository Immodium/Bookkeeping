interface AddressFields {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}

export const formatClientAddress = (fields: AddressFields): string => {
  if (!fields) return '';

  const { address, city, state, zipCode, country } = fields;

  const addressParts: string[] = [];

  if (address && address.trim()) {
    addressParts.push(address.trim());
  }

  const locationParts: string[] = [];
  if (city && city.trim()) {
    locationParts.push(city.trim());
  }
  if (state && state.trim()) {
    locationParts.push(state.trim());
  }
  if (zipCode && zipCode.trim()) {
    locationParts.push(zipCode.trim());
  }

  if (locationParts.length > 0) {
    addressParts.push(locationParts.join(', '));
  }

  if (country && country.trim() && country.trim().toLowerCase() !== 'us' && country.trim().toLowerCase() !== 'usa') {
    addressParts.push(country.trim());
  }

  return addressParts.join('\n');
};

export const formatClientAddressSingleLine = (fields: AddressFields): string => {
  if (!fields) return '';

  const { address, city, state, zipCode } = fields;

  const addressParts: string[] = [];

  if (address && address.trim()) {
    addressParts.push(address.trim());
  }
  if (city && city.trim()) {
    addressParts.push(city.trim());
  }
  if (state && state.trim()) {
    addressParts.push(state.trim());
  }
  if (zipCode && zipCode.trim()) {
    addressParts.push(zipCode.trim());
  }

  return addressParts.join(', ');
};

export const formatCompanyAddress = (company: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}): string => {
  return formatClientAddress(company);
};