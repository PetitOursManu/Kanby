/**
 * Real dependencies of the admin in Kosmy Board: the Kosmy Board sign-in
 * settings, discovery / JWKS cache and `sub` → account link (shared with
 * "Se connecter avec Kosmy Board"), and Kanby's admin functions.
 */
import { createUserAsAdmin, deleteUserAsAdmin, getAdminStats, listAdminBoards, listAdminUsers, updateUserAsAdmin } from "@/lib/admin/service";
import { discover } from "@/lib/kosmy-board/oidc";
import {
  disableKosmySettings,
  getKosmySettings,
  getKosmySettingsView,
  prismaAccountRepo,
  saveKosmySettings,
} from "@/lib/kosmy-board/server";
import { JtiCache } from "@/lib/kosmy-board/admin-token";
import type { BoardAdminDeps } from "@/lib/kosmy-board/admin";

/** One per server process: a token is accepted only once. */
const jti = new JtiCache();

export const boardAdminDeps: BoardAdminDeps = {
  getSettings: getKosmySettings,
  discover: (issuer) => discover(issuer),
  findUserBySub: (sub) => prismaAccountRepo.findBySub(sub),
  jti,
  admin: {
    stats: getAdminStats,
    listUsers: listAdminUsers,
    listBoards: listAdminBoards,
    createUser: createUserAsAdmin,
    updateUser: updateUserAsAdmin,
    deleteUser: deleteUserAsAdmin,
    kosmySettings: getKosmySettingsView,
    saveKosmySettings,
    disableKosmy: disableKosmySettings,
  },
};
