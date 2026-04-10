'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/utils/logger';

const STORAGE_KEY = 'syncly_onboarding_state';
const EXPIRY_HOURS = 24; // State expires after 24 hours

interface OnboardingState {
    step: number;
    shopData: {
        name?: string;
        owner_name?: string;
        phone?: string;
    };
    fbConnected: boolean;
    igConnected: boolean;
    productsAdded: boolean;
    aiConfigured: boolean;
    timestamp: number;
}

const defaultState: OnboardingState = {
    step: 1,
    shopData: {},
    fbConnected: false,
    igConnected: false,
    productsAdded: false,
    aiConfigured: false,
    timestamp: Date.now()
};

export function useOnboardingState() {
    const [state, setState] = useState<OnboardingState>(defaultState);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasExistingState, setHasExistingState] = useState(false);

    // Load state from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed: OnboardingState = JSON.parse(stored);

                // Check if state is expired
                const hoursElapsed = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
                if (hoursElapsed < EXPIRY_HOURS) {
                    setState(parsed);
                    setHasExistingState(parsed.step > 1);
                } else {
                    // Clear expired state
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch (err) {
            logger.error('Error loading onboarding state:', { error: err });
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Save state to localStorage
    const saveState = useCallback((updates: Partial<OnboardingState>) => {
        setState(prev => {
            const newState = {
                ...prev,
                ...updates,
                timestamp: Date.now()
            };

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
            } catch (err) {
                logger.error('Error saving onboarding state:', { error: err });
            }

            return newState;
        });
    }, []);

    // Update step
    const setStep = useCallback((step: number) => {
        saveState({ step });
    }, [saveState]);

    // Update shop data
    const updateShopData = useCallback((data: Partial<OnboardingState['shopData']>) => {
        setState(prev => {
            const newState = {
                ...prev,
                shopData: { ...prev.shopData, ...data },
                timestamp: Date.now()
            };

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
            } catch (err) {
                logger.error('Error saving onboarding state:', { error: err });
            }

            return newState;
        });
    }, []);

    // Mark step as complete
    const markComplete = useCallback((key: 'fbConnected' | 'igConnected' | 'productsAdded' | 'aiConfigured') => {
        saveState({ [key]: true });
    }, [saveState]);

    // Clear all state (start fresh)
    const clearState = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            logger.error('Error clearing onboarding state:', { error: err });
        }
        setState(defaultState);
        setHasExistingState(false);
    }, []);

    // Continue from saved state
    const continueFromSaved = useCallback(() => {
        // State is already loaded, just acknowledge
        setHasExistingState(false);
    }, []);

    return {
        // State
        step: state.step,
        shopData: state.shopData,
        fbConnected: state.fbConnected,
        igConnected: state.igConnected,
        productsAdded: state.productsAdded,
        aiConfigured: state.aiConfigured,

        // Meta
        isLoaded,
        hasExistingState,

        // Actions
        setStep,
        updateShopData,
        markComplete,
        saveState,
        clearState,
        continueFromSaved
    };
}
