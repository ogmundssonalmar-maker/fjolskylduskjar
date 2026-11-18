import { household } from '../../src/household.js';

export function onRequest({ request, env }) {
  return household(request, env);
}
