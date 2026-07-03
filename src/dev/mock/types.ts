export type MockProfilePreview = {
  pid: string
  given_name: string
  family_name: string
  title_th: string
  birthdate?: string
  gender?: string
  address?: string
  birthdate_scenario?: 'full' | 'year_be' | 'year_month_no_day'
  birthdate_label?: string
}

export type StoredDevMockLogin = {
  authorization_url: string
  state: string
  mock_profile?: MockProfilePreview
}
