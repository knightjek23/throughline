/**
 * Plan-tier limits + enforcement helpers.
 * Locked v1 decisions (2026-04-25):
 *   - Trial: 21 days, 1 study, 5 interviews/study
 *   - Solo $19: 3 active studies, 25 interviews/study
 *   - Pro $39: unlimited studies, unlimited interviews (soft cap 200/mo with conversation)
 */

export type Plan = 'trial' | 'solo' | 'pro' | 'past_due' | 'canceled';

export interface PlanLimits {
  maxActiveStudies: number;        // -1 = unlimited
  maxInterviewsPerStudy: number;   // -1 = unlimited
  exportFormats: Array<'markdown' | 'pdf'>;
  canSynthesize: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  trial:    { maxActiveStudies: 1,  maxInterviewsPerStudy: 5,   exportFormats: ['markdown'],         canSynthesize: true  },
  solo:     { maxActiveStudies: 3,  maxInterviewsPerStudy: 25,  exportFormats: ['markdown'],         canSynthesize: true  },
  pro:      { maxActiveStudies: -1, maxInterviewsPerStudy: -1,  exportFormats: ['markdown'],         canSynthesize: true  },
  past_due: { maxActiveStudies: 0,  maxInterviewsPerStudy: 0,   exportFormats: ['markdown'],         canSynthesize: false },
  canceled: { maxActiveStudies: 0,  maxInterviewsPerStudy: 0,   exportFormats: [],                   canSynthesize: false },
};

export const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 21);
