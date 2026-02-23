import axios from 'axios';

// Base URL - vite.config.ts proxy se connect hota hai
const API_BASE_URL = '/api';

// Public API client - public endpoints ke liye (authentication nahi chahiye)
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Auth API client - separate instance authentication ke liye
const authApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - JWT token add karta hai authenticated requests mein
authApi.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - token refresh handle karta hai
authApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Agar 401 error aaye aur retry nahi kiya ho
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await authService.refreshToken(refreshToken);
          const { accessToken, refreshToken: newRefreshToken } = response.data;

          // Naye tokens store karo
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', newRefreshToken);

          // Original request ko naye token ke saath retry karo
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return authApi(originalRequest);
        }
      } catch (refreshError) {
        // Refresh token bhi invalid hai, logout kar do
        authService.clearAuthData();
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Authentication Service - saari API calls yahan defined hain
const authService = {
  /**
   * REGISTRATION ENDPOINTS
   */

  // Quick Registration (Email-only) - API token turant milta hai
  async quickRegister(email, name = null, organization = null) {
    try {
      const response = await authApi.post('/v1/auth/register', {
        email,
        name,
        organization
      });

      // Account data store karo agar mil gaya
      const accountData = response.data.data.account;
      if (accountData) {
        localStorage.setItem('user_data', JSON.stringify(accountData));
      }

      // Token store karo with account data
      if (response.data.data.token) {
        const tokenData = response.data.data.token;
        this.storeApiToken(tokenData.token, tokenData, accountData);
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Full Registration (With Password) - Email verification required
  async fullRegister(email, password, name, organization = null) {
    try {
      const response = await authApi.post('/v1/auth/register', {
        email,
        password,
        name,
        organization
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * LOGIN & SESSION MANAGEMENT
   */

  // Login - JWT tokens milte hain (access + refresh)
  async login(email, password) {
    try {
      const response = await authApi.post('/v1/auth/login', {
        email,
        password
      });

      const { accessToken, refreshToken, account } = response.data.data;

      // Tokens store karo
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user_data', JSON.stringify(account));

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Refresh Token - Naya access token le lo
  async refreshToken(refreshToken) {
    try {
      const response = await authApi.post('/v1/auth/refresh', {
        refreshToken
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Logout - Current session revoke karo
  async logout() {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        await authApi.post('/v1/auth/logout', { refreshToken });
      }
      this.clearAuthData();
    } catch (error) {
      this.clearAuthData();
      throw this.handleError(error);
    }
  },

  // Logout All - Saare devices se logout
  async logoutAll() {
    try {
      const response = await authApi.post('/v1/auth/logout-all');
      this.clearAuthData();
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * PASSWORD MANAGEMENT
   */

  // Forgot Password - Reset link request karo
  async forgotPassword(email) {
    try {
      // PUBLIC endpoint - no JWT required
      // Use publicApi instead of authApi to avoid auth headers
      console.log('📧 [Forgot Password] Sending request for:', email);
      const response = await publicApi.post('/v1/auth/forgot-password', {
        email
      });
      console.log('✓ [Forgot Password] Response:', response.data.message);
      return response.data;
    } catch (error) {
      console.error('❌ [Forgot Password] Error:', error.response?.status, error.response?.data?.error);
      throw this.handleError(error);
    }
  },

  // Reset Password - Token se password reset karo
  async resetPassword(token, newPassword) {
    try {
      // PUBLIC endpoint - no JWT required
      // Use publicApi instead of authApi to avoid auth headers
      console.log('🔐 [Reset Password] Sending request');
      const response = await publicApi.post('/v1/auth/reset-password', {
        token,
        newPassword
      });
      console.log('✓ [Reset Password] Success:', response.data.message);
      return response.data;
    } catch (error) {
      console.error('❌ [Reset Password] Error:', error.response?.status, error.response?.data?.error);
      throw this.handleError(error);
    }
  },

  // Change Password - Logged in user ka password change karo
  async changePassword(currentPassword, newPassword) {
    try {
      // PROTECTED endpoint - JWT required
      // Use authApi which automatically adds Authorization header
      console.log('🔐 [Change Password] Sending request');
      const response = await authApi.put('/v1/auth/password', {
        currentPassword,
        newPassword
      });
      console.log('✓ [Change Password] Success:', response.data.message);
      return response.data;
    } catch (error) {
      console.error('❌ [Change Password] Error:', error.response?.status, error.response?.data?.error);
      throw this.handleError(error);
    }
  },

  /**
   * EMAIL VERIFICATION
   */

  // Verify Email - Token se email verify karo
  async verifyEmail(token) {
    try {
      const response = await authApi.post('/v1/auth/verify-email', {
        token
      });

      // Backend صرف API token دیتا ہے، JWT tokens نہیں
      // Agar already verified ہے تو alreadyVerified flag ہوگا
      if (response.data.data.alreadyVerified) {
        console.log('Email already verified');
        return response.data;
      }

      // Store API token (اگر نیا verification ہے)
      if (response.data.data.token) {
        const tokenData = response.data.data.token;
        const apiToken = tokenData.token;
        this.storeApiToken(apiToken, tokenData);
        console.log('API token stored:', tokenData.token_prefix);
      }

      // Store email data
      if (response.data.data.email) {
        localStorage.setItem('verified_email', response.data.data.email);
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Resend Verification - Verification email dobara bhejo
  async resendVerification(email) {
    try {
      const response = await authApi.post('/v1/auth/resend-verification', {
        email
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Verification Status Check - API token se status check karo
  async getVerificationStatus(apiToken) {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/v1/auth/verification-status`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`
          }
        }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * TOKEN MANAGEMENT (API Tokens)
   */

  // List Tokens - Saare API tokens list karo
  async listTokens() {
    try {
      const response = await authApi.get('/v1/auth/tokens');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Create Token - Naya API token banao
  async createToken(name = 'API Token', expiresIn = null) {
    try {
      const response = await authApi.post('/v1/auth/tokens', {
        name,
        expiresIn
      });

      // Token store karo
      const tokenData = response.data.data.token;
      this.storeApiToken(tokenData.token, tokenData);

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Delete Token - API token delete karo
  async deleteToken(tokenId) {
    try {
      // Pehle localStorage se remove karo (immediate effect)
      this.removeApiTokenById(tokenId);
      
      // Phir backend ko call karo
      const response = await authApi.delete(`/v1/auth/tokens/${tokenId}`);
      
      console.log('Token deleted successfully:', tokenId);
      return response.data;
    } catch (error) {
      console.error('Delete token error:', error);
      // Agar backend mein error ho to localStorage se to remove reh gaya
      // Frontend side delete successful hai
      throw this.handleError(error);
    }
  },

  // Regenerate Token - Token regenerate karo (purana invalid ho jayega)
  async regenerateToken(tokenId) {
    try {
      const response = await authApi.post(
        `/v1/auth/tokens/${tokenId}/regenerate`
      );

      // Naya token store karo
      const tokenData = response.data.data.token;
      this.updateApiToken(tokenId, tokenData);

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * ACCOUNT MANAGEMENT
   */

  // Get Account - Current account details
  async getAccount() {
    try {
      const response = await authApi.get('/v1/auth/account');

      // User data update karo
      localStorage.setItem('user_data', JSON.stringify(response.data.data.account));

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Get All Accounts - Admin ke liye saare accounts list karo
  async getAllAccounts() {
    try {
      const response = await authApi.get('/v1/auth/accounts');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Get Account By Email - Email se account details lo
  async getAccountByEmail(email) {
    try {
      const response = await authApi.get(`/v1/auth/account/${email}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  // Generate Token Via Email - Quick registration (public endpoint)
  // This is actually a quick registration that returns token immediately
  async generateTokenViaEmail(email, name = null, organization = null) {
    try {
      // Use the register endpoint with just email (quick registration)
      const response = await publicApi.post('/v1/auth/register', {
        email,
        name,
        organization
      });

      console.log('generateTokenViaEmail response:', response.data)

      // Response structure: { data: { account, token }, message, ... }
      const { data } = response.data || {};
      
      if (data && data.token && data.token.token) {
        this.storeApiToken(data.token.token, data.token);
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * UTILITY METHODS
   */

  // API Token Store karo localStorage mein
  storeApiToken(fullToken, tokenData, accountData = null) {
    const tokens = this.getStoredApiTokens();

    // Check karein ke token already stored hai ya nahi
    const existingIndex = tokens.findIndex(t => t.id === tokenData.id);

    // User data se email aur organization lo (agar available ho)
    let email = null;
    let organization = null;

    if (accountData) {
      email = accountData.email;
      organization = accountData.organization;
    } else {
      // LocalStorage se user_data check karo
      const userData = this.getCurrentUser();
      if (userData) {
        email = userData.email;
        organization = userData.organization;
      }
    }

    const tokenToStore = {
      id: tokenData.id,
      token: fullToken,
      token_prefix: tokenData.token_prefix,
      name: tokenData.name,
      created_at: tokenData.created_at,
      expires_at: tokenData.expires_at || null,
      last_used_at: tokenData.last_used_at || null,
      status: 'active',
      email: email,
      organization: organization
    };

    if (existingIndex >= 0) {
      tokens[existingIndex] = tokenToStore;
    } else {
      tokens.push(tokenToStore);
    }

    localStorage.setItem('api_tokens', JSON.stringify(tokens));
  },

  // Stored API Tokens get karo
  getStoredApiTokens() {
    const stored = localStorage.getItem('api_tokens');
    return stored ? JSON.parse(stored) : [];
  },

  // Token ID se remove karo
  removeApiTokenById(tokenId) {
    const tokens = this.getStoredApiTokens();
    const beforeCount = tokens.length;
    const filtered = tokens.filter(t => t.id !== tokenId);
    const afterCount = filtered.length;
    
    localStorage.setItem('api_tokens', JSON.stringify(filtered));
    
    console.log(`Removed token ${tokenId}. Before: ${beforeCount}, After: ${afterCount}`);
    
    // Verify deletion
    const verify = this.getStoredApiTokens();
    console.log('Remaining tokens:', verify.map(t => ({ id: t.id, name: t.name })));
  },

  // Token update karo (regenerate ke baad)
  updateApiToken(tokenId, newTokenData) {
    const tokens = this.getStoredApiTokens();
    const index = tokens.findIndex(t => t.id === tokenId);

    if (index >= 0) {
      tokens[index] = {
        ...tokens[index],
        token: newTokenData.token,
        token_prefix: newTokenData.token_prefix,
        created_at: newTokenData.created_at,
        last_used_at: null
      };
      localStorage.setItem('api_tokens', JSON.stringify(tokens));
    }
  },

  // Check karein user logged in hai ya nahi
  isAuthenticated() {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    return !!(accessToken && refreshToken);
  },

  // Check karein API token hai ya nahi
  hasApiToken() {
    const tokens = this.getStoredApiTokens();
    return tokens.length > 0;
  },

  // Current user data get karo
  getCurrentUser() {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
  },

  // Auth data clear karo (logout ke time)
  clearAuthData() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    // API tokens mat clear karo, woh persist rahenge
  },

  // Complete cleanup (sab kuch remove karo)
  clearAllData() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('api_tokens');
  },

  // Error handling helper
  handleError(error) {
    if (error.response) {
      // Server ne response diya hai with error status
      const errorMessage = error.response.data?.error || error.response.data?.message || 'An error occurred';
      return new Error(errorMessage);
    } else if (error.request) {
      // Request bheji gayi lekin response nahi aaya
      return new Error('No response from server. Please check your connection.');
    } else {
      // Kuch aur error hai
      return new Error(error.message || 'An unexpected error occurred');
    }
  }
};

export default authService;
