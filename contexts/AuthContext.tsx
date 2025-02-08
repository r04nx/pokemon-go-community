import { Session, User, AuthError } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

// Replace the hardcoded client IDs with environment variables
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_CLIENT_ID_EXPO = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ user: User; session: Session; } | undefined>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error.message);
        return;
      }
      handleAuthStateChange('INITIAL', session);
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthStateChange = async (event: string, session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);
    
    if (session?.user) {
      await loadUserProfile(session.user.id);
      if (event === 'SIGNED_IN') {
        router.replace('/(tabs)');
      }
    } else {
      setUserProfile(null);
      if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/sign-in');
      }
    }
    
    setLoading(false);
  };

  const loadUserProfile = async (userId: string) => {
    try {
      // First try to get the existing profile
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, try to create one
          try {
            const { data: newProfile, error: createError } = await supabase
              .from('user_profiles')
              .upsert([{  // Changed from insert to upsert
                id: userId,
                username: user?.user_metadata?.username || `Trainer${userId.substring(0, 6)}`,
                avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
                trainer_level: 1,
                civic_coins: 0,
                trust_score: 0,
                rank: 'Novice Trainer',
                badges: []
              }], {
                onConflict: 'id',  // Specify the conflict handling
                ignoreDuplicates: true
              })
              .select()
              .single();

            if (createError) {
              console.error('Error creating profile:', createError);
              return;
            }

            setUserProfile(newProfile);
            return;
          } catch (createError: any) {
            // If creation failed, try one more time to fetch the profile
            const { data: retryProfile, error: retryError } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', userId)
              .single();
            
            if (!retryError && retryProfile) {
              setUserProfile(retryProfile);
              return;
            }
            
            console.error('Final error in profile creation:', createError);
            return;
          }
        }
        
        console.error('Error loading profile:', error);
        return;
      }

      setUserProfile(profile);
    } catch (error: any) {
      console.error('Error in loadUserProfile:', error.message);
    }
  };

  const handleAuthError = (error: AuthError, action: string) => {
    let message = 'An error occurred';
    
    switch (error.message) {
      case 'Invalid login credentials':
        message = 'Incorrect email or password';
        break;
      case 'Email not confirmed':
        message = 'Please verify your email address';
        break;
      case 'Password should be at least 6 characters':
        message = 'Password must be at least 6 characters';
        break;
      case 'User already registered':
        message = 'An account with this email already exists';
        break;
      default:
        message = error.message;
    }
    
    Alert.alert(`${action} Error`, message);
    throw error;
  };

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = makeRedirectUri({
        scheme: 'pokemongo-community',
        path: 'google-auth',
        preferLocalhost: false,
        useProxy: true
      });

      console.log('Redirect URL:', redirectUrl);

      const clientId = Platform.select({
        android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        default: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
      });

      if (!clientId) {
        throw new Error('Google Client ID is not configured');
      }

      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      const client = new AuthSession.AuthRequest({
        clientId,
        scopes: ['openid', 'profile', 'email'],
        redirectUri: redirectUrl,
        responseType: 'id_token',
        usePKCE: false,
        extraParams: {
          nonce: Math.random().toString(36).substring(7),
          prompt: 'select_account',
        },
      });

      const result = await client.promptAsync(discovery, {
        useProxy: true,
        showInRecents: true,
      });

      if (result.type === 'success' && result.params?.id_token) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: result.params.id_token,
        });

        if (error) throw error;
        
        if (data.user) {
          await loadUserProfile(data.user.id);
        }

        return data;
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      Alert.alert('Error', 'Failed to sign in with Google. Please try again.');
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            full_name: username,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create user profile directly instead of using RPC
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert([{
            id: data.user.id,
            username: username,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            trainer_level: 1,
            civic_coins: 0,
            trust_score: 0,
            rank: 'Novice Trainer',
            badges: []
          }]);

        if (profileError) {
          console.error('Error creating profile:', profileError);
        }
      }

      Alert.alert(
        'Success',
        'Account created successfully! Please check your email to verify your account.'
      );
      router.replace('/(auth)/sign-in');
    } catch (error: any) {
      handleAuthError(error, 'Sign Up');
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      handleAuthError(error, 'Sign In');
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      handleAuthError(error, 'Sign Out');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'pokemongo-community://reset-password',
      });
      if (error) throw error;
      Alert.alert(
        'Password Reset',
        'Check your email for password reset instructions'
      );
    } catch (error: any) {
      handleAuthError(error, 'Password Reset');
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });
      if (error) throw error;
      Alert.alert('Success', 'Your password has been updated');
    } catch (error: any) {
      handleAuthError(error, 'Password Update');
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userProfile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        refreshProfile,
        resetPassword,
        updatePassword,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 