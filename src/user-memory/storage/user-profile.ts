/**
 * User profile types and storage interface.
 * Port of Python powermem/user_memory/storage/base.py + user_profile.py.
 */

export interface UserProfile {
  id: string;
  userId: string;
  profileContent?: string;
  topics?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileStore {
  saveProfile(userId: string, profileContent?: string, topics?: Record<string, unknown>): Promise<string>;
  getProfileByUserId(userId: string): Promise<UserProfile | null>;
  getProfiles(options?: { userId?: string; mainTopic?: string; subTopic?: string; limit?: number; offset?: number }): Promise<UserProfile[]>;
  deleteProfile(profileId: string): Promise<boolean>;
  countProfiles(userId?: string): Promise<number>;
  close(): Promise<void>;
}
