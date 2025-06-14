import { Resources } from "@tago-io/sdk";

/**
 * @description Get the ID of the current profile.
 */
async function getProfileID(resources: Resources) {
  const profileInfo = await resources.profiles.info("current").catch((error) => {
    throw `**Error to get profile ID:** ${error}`;
  });

  const profileID = profileInfo.info.id;

  return profileID;
}

export { getProfileID };
