/** sessionStorage key the owner-login step writes to once it has resolved a restaurant,
 *  and the staff-picker step reads from. Mirrors the prototype's
 *  `sessionStorage.getItem('restropro_active_restaurant')` bootstrap check — kept out of the
 *  URL so the restaurant slug never ends up in browser history or server logs. */
export const ACTIVE_RESTAURANT_KEY = "restropro_active_restaurant";

export type ActiveRestaurant = { slug: string; name: string };
