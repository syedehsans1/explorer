// Type declarations for auth-service

declare module '@/api/auth-service' {
  interface AuthService {
    quickRegister(email: string, name?: string | null, organization?: string | null): Promise<any>;
    fullRegister(email: string, password: string, name: string, organization?: string | null): Promise<any>;
    login(email: string, password: string): Promise<any>;
    refreshToken(refreshToken: string): Promise<any>;
    logout(): Promise<void>;
    logoutAll(): Promise<any>;
    forgotPassword(email: string): Promise<any>;
    resetPassword(token: string, newPassword: string): Promise<any>;
    changePassword(currentPassword: string, newPassword: string): Promise<any>;
    verifyEmail(token: string): Promise<any>;
    resendVerification(email: string): Promise<any>;
    getVerificationStatus(apiToken: string): Promise<any>;
    listTokens(): Promise<any>;
    createToken(name?: string, expiresIn?: number | null): Promise<any>;
    deleteToken(tokenId: string): Promise<any>;
    regenerateToken(tokenId: string): Promise<any>;
    getAccount(): Promise<any>;
    getAllAccounts(): Promise<any>;
    getAccountByEmail(email: string): Promise<any>;
    generateTokenViaEmail(email: string): Promise<any>;
    storeApiToken(fullToken: string, tokenData: any, accountData?: any): void;
    getStoredApiTokens(): any[];
    removeApiTokenById(tokenId: string): void;
    updateApiToken(tokenId: string, newTokenData: any): void;
    isAuthenticated(): boolean;
    hasApiToken(): boolean;
    getCurrentUser(): any;
    clearAuthData(): void;
    clearAllData(): void;
    handleError(error: any): Error;
  }

  const authService: AuthService;
  export default authService;
}
