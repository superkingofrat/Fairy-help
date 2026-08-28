export interface Profile {
  userId: string;
  name: string;
  avatarUrl: string | null;
  styleTags: string[];
  likeGenres: string[];
  avoidFood: string[];
  dietPreference: string | null;
  travelStyle: string | null;
  createdAt: string;
  updatedAt: string;
}
