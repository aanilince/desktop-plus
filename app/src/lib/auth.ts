import { Account } from '../models/account'

/** Get the auth key for the user. */
export function getKeyForAccount(account: Account): string {
  return getKeyForEndpoint(account.endpoint, account.login)
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string, login: string): string {
  // Don't modify this string! This is used for storing the password in the keychain
  const appName = __DEV__ ? 'GitHub Pickaxe Dev' : 'GitHub Pickaxe'

  return `${appName} - ${endpoint} - ${login}`
}
