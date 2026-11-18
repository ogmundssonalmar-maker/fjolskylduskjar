// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var UINT32_RANGE = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers)
    buf.set(buffer, i), i += buffer.length;
  return buf;
}
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
  if (typeof string == "string" && string.length >= 128) {
    if (NON_ASCII.test(string))
      throw new TypeError("non-ASCII string encountered in encode()");
    return encoder.encode(string);
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127)
      throw new TypeError("non-ASCII string encountered in encode()");
    bytes[i] = code;
  }
  return bytes;
}
function decodeBase64(encoded, url = false) {
  if (Uint8Array.fromBase64)
    return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
  if (url) {
    if (encoded.includes("+") || encoded.includes("/"))
      throw new TypeError("Invalid base64url");
    encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  }
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
  [Symbol.asyncIterator] = async function* () {
  };
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSTimeout = class extends JOSEError {
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message2 = "request timed out", options) {
    super(message2, options);
  }
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
  try {
    return decodeBase64(typeof input == "string" ? input : decoder.decode(input), true);
  } catch (cause) {
    throw new TypeError(invalid, { cause });
  }
}

// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
  if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]")
    return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isJwkSet(input) {
  return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
function isDisjoint(...headers) {
  const parameters = /* @__PURE__ */ new Set();
  for (const header of headers)
    if (header)
      for (const parameter of Object.keys(header)) {
        if (parameters.has(parameter))
          return false;
        parameters.add(parameter);
      }
  return true;
}
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch (cause) {
    throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
  }
}
function encodeAsciiMember(value, label, ErrorClass) {
  try {
    return encode(value);
  } catch (cause) {
    throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
  }
}
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message2) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
  } catch (cause) {
    throw new ErrorClass(message2, { cause });
  }
  if (!isObject(parsed))
    throw new ErrorClass(message2);
  return parsed;
}
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string")))
    throw new TypeError(`"${option}" option must be an array of strings`);
  return algorithms === void 0 ? void 0 : new Set(algorithms);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0)
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!protectedHeader || protectedHeader.crit === void 0)
    return [];
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0))
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  const recognized = recognizedOption === void 0 ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized))
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0)
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0))
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
  }
  return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b64 = protectedHeader.b64;
    if (typeof b64 != "boolean")
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    return b64;
  }
  return true;
}

// node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
  const { alg } = entry;
  if (key.use !== void 0) {
    const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
    if (key.use !== expected)
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
  }
  if (key.alg !== void 0 && key.alg !== alg)
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  if (Array.isArray(key.key_ops)) {
    const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
    if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp))
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
  }
};
async function prepareKey(entry, key, usage) {
  const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
  if (secret && key instanceof Uint8Array)
    return key;
  let normalized, keyObject;
  if (isObject(key)) {
    if (normalized = normalizeJwk(key), typeof normalized.kty != "string")
      throw invalidKeyType(alg, key, secret);
    if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0)))
      throw new TypeError(secret ? 'JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present' : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
    if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct")
      return decode(normalized.k);
    if (!Object.isFrozen(key)) {
      const { key_ops } = key;
      Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
    }
  } else {
    if (!isKeyLike(key))
      throw invalidKeyType(alg, key, secret);
    const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
    if (key.type !== expectedType && (secret || ["secret", "public", "private"].includes(key.type)))
      throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
    if (isCryptoKey(key))
      return key;
    if (keyObject = key, keyObject.type === "secret")
      return keyObject.export();
  }
  cache ||= /* @__PURE__ */ new WeakMap();
  const cacheKey = key;
  let cached = cache.get(cacheKey);
  if (cached?.[alg])
    return cached[alg];
  if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
    const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({ crv, asymmetricKeyType: keyObject.asymmetricKeyType }) ?? entry.subtle;
    return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
  }
  return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
var isCryptoKey = (key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
  return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
  const types = ["CryptoKey", "KeyObject", "JSON Web Key"];
  return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
var unusable = (name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage))
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
  const { modulusLength } = key.algorithm;
  if (typeof modulusLength != "number" || modulusLength < 2048)
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
  const algorithm = key.algorithm;
  if (algorithm.name !== expected.name)
    throw unusable(expected.name);
  if (expected.hash && algorithm.hash?.name !== expected.hash)
    throw unusable(expected.hash, "algorithm.hash");
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve)
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  if (expected.length !== void 0 && algorithm.length !== expected.length)
    throw unusable(expected.length, "algorithm.length");
  checkUsage(key, usage);
}
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== void 0 && typeof normalized.ext != "boolean")
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  if (normalized.key_ops !== void 0) {
    const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
    if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length)
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    normalized.key_ops = keyOps;
  }
  return normalized;
}
async function jwkToKey(entry, jwk, extractable) {
  if (!entry.kty.includes(jwk.kty))
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = { ...jwk, ext: extractable ?? jwk.ext };
  return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = false) {
  return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}

// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
  const out = { __proto__: null };
  for (const alg in entries)
    out[alg] = { ...entries[alg], alg };
  return out;
}

// node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
function rsa(bits, saltLength) {
  const subtle = { name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
function mldsa(parameterSet) {
  const subtle = { name: `ML-DSA-${parameterSet}` };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
var JWS = table({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg == "string" ? JWS[alg] : void 0;
  if (!entry)
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  return entry;
}

// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtectedHeader) {
  return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch (cause) {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", {
      cause
    });
  }
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
  const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
  if (!isDisjoint(protectedHeader, header))
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  const joseHeader = { ...protectedHeader, ...header }, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
  if (typeof alg != "string" || !alg)
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  if (shared[0] && !shared[0].has(alg))
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  if (b64) {
    if (typeof inputPayload != "string")
      throw new JWSInvalid("JWS Payload must be a string");
  } else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array))
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
  let resolvedKey = false;
  typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = true);
  const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
  entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
  } catch (cause) {
    throw new JWSSignatureVerificationFailed(void 0, { cause });
  }
  if (!verified)
    throw new JWSSignatureVerificationFailed();
  const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
  return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{ ...result, key: verificationKey }, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
  if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string")
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3)
    throw new JWSInvalid("Invalid Compact JWS");
  return verifySignature({ payload, protected: protectedHeader, signature }, shared, key, encodeCompactUnencodedPayload);
}

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1e3);
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
function secs(str) {
  typeof str != "string" && invalidDuration();
  const matched = REGEX.exec(str);
  (!matched || matched[4] && matched[1]) && invalidDuration();
  const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
function validateInput(label, input) {
  if (!Number.isFinite(input))
    throw new TypeError(`Invalid ${label} input`);
  return input;
}
var normalizeTyp = (value) => {
  const normalized = value.toLowerCase();
  return value.includes("/") ? normalized : `application/${normalized}`;
};
var checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : false;
function validateNumericDate(claimsSet, claim, required = false) {
  const value = claimsSet[claim];
  if (!(value === void 0 && !required)) {
    if (typeof value != "number")
      throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
    return value;
  }
}
function unexpectedClaim(claimsSet, claim) {
  throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
  let claimsSet;
  try {
    claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
  } catch (cause) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
  }
  if (!isObject(claimsSet))
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  const { typ } = options;
  if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ)))
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', claimsSet, "typ", checkFailed);
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
  maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse()))
    if (!Object.hasOwn(claimsSet, claim))
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
  issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
  const { clockTolerance } = options;
  let tolerance = 0;
  if (typeof clockTolerance == "string")
    tolerance = secs(clockTolerance);
  else if (clockTolerance !== void 0) {
    if (typeof clockTolerance != "number")
      throw new TypeError("Invalid clockTolerance option type");
    tolerance = clockTolerance;
  }
  if (validateInput("clockTolerance option", tolerance), tolerance < 0)
    throw new TypeError("Invalid clockTolerance option input");
  const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
  if (nbf !== void 0 && nbf > now + tolerance)
    throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', claimsSet, "nbf", checkFailed);
  const exp = validateNumericDate(claimsSet, "exp");
  if (exp !== void 0 && exp <= now - tolerance)
    throw new JWTExpired('"exp" claim timestamp check failed', claimsSet, "exp", checkFailed);
  if (maxTokenAge !== void 0) {
    const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
    if (max < 0)
      throw new TypeError("Invalid maxTokenAge option input");
    if (age - tolerance > max)
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', claimsSet, "iat", checkFailed);
    if (age < -tolerance)
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', claimsSet, "iat", checkFailed);
  }
  return claimsSet;
}

// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
  if (!b64)
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  return { ...verified, payload };
}

// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
  const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
  return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
async function importWithAlgCache(cache2, jwk, entry) {
  const cached = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk), { alg } = entry;
  if (cached[alg] === void 0) {
    const pending = jwkToKey(entry, jwk, true).then((key) => {
      if (key.type !== "public")
        throw new JWKSInvalid("JSON Web Key Set members must be public keys");
      return cached[alg] = key, key;
    }).catch((error) => {
      throw cached[alg] === pending && delete cached[alg], error;
    });
    cached[alg] = pending;
  }
  return cached[alg];
}
function createLocalJWKSet(jwks) {
  let snapshot;
  try {
    snapshot = structuredClone(jwks);
  } catch (cause) {
    throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
  }
  if (!isJwkSet(snapshot))
    throw new JWKSInvalid("JSON Web Key Set malformed");
  const metadata = snapshot.keys.map((jwk) => {
    const normalized = snapshotJwk(jwk);
    return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
  }), cached = /* @__PURE__ */ new WeakMap();
  return Object.defineProperty(async (protectedHeader, token) => {
    const { alg, kid } = { ...protectedHeader, ...token?.header }, entry = typeof alg == "string" ? JWS[alg] : void 0;
    if (!entry || entry.secret)
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
    const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
    if (!length)
      throw new JWKSNoMatchingKey();
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys();
      throw error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates)
          try {
            yield await importWithAlgCache(cached, jwk2, entry);
          } catch {
          }
      }, error;
    }
    return importWithAlgCache(cached, jwk, entry);
  }, "jwks", {
    value: () => structuredClone(snapshot)
  });
}

// node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair < "u" || typeof navigator < "u" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
var USER_AGENT;
(typeof navigator > "u" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.17");
var customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
  const response2 = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers
  }).catch((err) => {
    throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
  });
  if (response2.status !== 200)
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  try {
    return await response2.json();
  } catch (cause) {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
  }
}
var jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp, duration) {
  return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
function validateDuration(value, fallback, option) {
  if (Number.isNaN(value))
    throw new TypeError(`"${option}" option must not be NaN`);
  if (typeof value == "number" && value < 0)
    throw new TypeError(`"${option}" option must not be negative`);
  return typeof value == "number" ? value : fallback;
}
function createRemoteJWKSet(url, options) {
  if (!(url instanceof URL))
    throw new TypeError("url must be an instance of URL");
  const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
  if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0))
    throw new TypeError('"timeoutDuration" option must be a non-negative integer');
  const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
  USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
  const fetchImpl = opts[customFetch], cache2 = opts[jwksCache];
  let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
  if (cache2 && typeof cache2 == "object") {
    const { uat, jwks } = cache2;
    isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
  }
  const reload = async () => {
    if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
      const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json) => {
        const next = createLocalJWKSet(json);
        if (sequence <= appliedSequence)
          return;
        local = next;
        const updatedAt = Date.now();
        cache2 && (cache2.uat = updatedAt, cache2.jwks = json), jwksTimestamp = updatedAt, appliedSequence = sequence;
      }).finally(() => {
        pendingFetch === current && (pendingFetch = void 0);
      });
    }
    await pendingFetch;
  };
  return Object.defineProperties(async (protectedHeader, token) => {
    (!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
    try {
      return await local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration))
        return await reload(), local(protectedHeader, token);
      throw err;
    }
  }, {
    coolingDown: {
      get: () => isFreshFor(jwksTimestamp, cooldownDuration),
      enumerable: true
    },
    fresh: {
      get: () => isFreshFor(jwksTimestamp, cacheMaxAge),
      enumerable: true
    },
    reload: {
      value: reload,
      enumerable: true
    },
    reloading: {
      get: () => !!pendingFetch,
      enumerable: true
    },
    jwks: {
      value: () => local?.jwks(),
      enumerable: true
    }
  });
}

// functions/_middleware.js
var keySets = /* @__PURE__ */ new Map();
function privateHeaders() {
  return new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
  });
}
async function onRequest({ request, env, next }) {
  const headers = privateHeaders();
  const denied = () => new Response("A\xF0gangur \xF3heimill.", { status: 403, headers });
  const cookieToken = request.headers.get("Cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || cookieToken;
  const reject = (reason) => {
    console.warn("Cloudflare Access:", reason);
    return denied();
  };
  const team = env.ACCESS_TEAM_DOMAIN;
  const audiences = (env.ACCESS_AUDIENCES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const parents = (env.ACCESS_PARENT_EMAILS ?? "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team ?? "") || !audiences.length) {
    return reject("configuration missing or invalid");
  }
  if (!token) return reject("token missing");
  const issuer = "https://" + team;
  if (!keySets.has(issuer)) {
    keySets.set(issuer, createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer)));
  }
  try {
    const { payload } = await jwtVerify(token, keySets.get(issuer), {
      issuer,
      audience: audiences,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "email"]
    });
    if (typeof payload.email !== "string" || parents.length > 0 && !parents.includes(payload.email.toLowerCase())) {
      return reject("email not allowed");
    }
  } catch (error) {
    const reason = error?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" ? error.claim : error?.code;
    return reject(reason || "verification failed");
  }
  const response2 = await next();
  const protectedResponse = new Response(response2.body, response2);
  headers.forEach((value, name) => protectedResponse.headers.set(name, value));
  return protectedResponse;
}

// src/calendar.js
var google = "https://www.googleapis.com/calendar/v3";
async function readCalendar(env, now = /* @__PURE__ */ new Date()) {
  const ids = [...new Set((env.GOOGLE_CALENDAR_IDS || "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { connected: false, events: [] };
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN
    })
  });
  if (!tokenResponse.ok) throw new Error("Google OAuth failed");
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw new Error("Google OAuth returned no token");
  const today = now.toISOString().slice(0, 10);
  const timeMin = today + "T00:00:00Z";
  const timeMax = new Date(Date.parse(timeMin) + 45 * 864e5).toISOString();
  const headers = { Authorization: "Bearer " + token };
  const events = /* @__PURE__ */ new Map();
  for (const id of ids) {
    const url = new URL(google + "/calendars/" + encodeURIComponent(id) + "/events");
    url.search = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: "Atlantic/Reykjavik"
    });
    do {
      const response2 = await fetch(url, { headers });
      if (!response2.ok) throw new Error("Google Calendar request failed");
      const page = await response2.json();
      for (const item of page.items || []) {
        if (item.status === "cancelled" || !item.start || !item.end) continue;
        const start = item.start.date || new Date(item.start.dateTime).toISOString().slice(0, 10);
        const end = new Date(Date.parse(item.end.date || item.end.dateTime) - 1).toISOString().slice(0, 10);
        const time = item.start.dateTime ? new Date(item.start.dateTime).toISOString().slice(11, 16) : void 0;
        const occurrence = item.originalStartTime || item.start;
        const key = item.iCalUID ? JSON.stringify([item.iCalUID, occurrence.date || new Date(occurrence.dateTime).toISOString()]) : id + ":" + item.id;
        events.set(key, {
          start,
          end: end < start ? start : end,
          time,
          title: item.summary || "Vi\xF0bur\xF0ur",
          type: "dagatal",
          note: ""
        });
      }
      if (!page.nextPageToken) break;
      url.searchParams.set("pageToken", page.nextPageToken);
    } while (true);
  }
  return { connected: true, events: [...events.values()] };
}

// src/household.js
var response = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" }
});
function validState(state) {
  return Number.isSafeInteger(state?.version) && state.version >= 0 && Array.isArray(state.tasks) && state.tasks.length <= 250 && state.tasks.every((task) => typeof task?.name === "string" && task.name.trim().length > 0 && task.name.length <= 180 && typeof task.done === "boolean") && Array.isArray(state.meals) && state.meals.length === 7 && state.meals.every((meal) => typeof meal?.name === "string" && meal.name.trim().length > 0 && meal.name.length <= 180 && typeof meal.day === "string" && meal.day.length <= 4 && (meal.minutes === null || Number.isInteger(meal.minutes) && meal.minutes >= 0 && meal.minutes <= 1440) && typeof meal.url === "string" && meal.url.length <= 1024 && (meal.url === "" || URL.canParse(meal.url) && ["https:", "http:"].includes(new URL(meal.url).protocol)));
}
async function household(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/calendar" && request.method === "GET") {
    try {
      return response(await readCalendar(env));
    } catch {
      return response({ error: "Ekki n\xE1\xF0ist \xED Google Calendar." }, 502);
    }
  }
  if (pathname !== "/api/household") return response({ error: "Sl\xF3\xF0 fannst ekki." }, 404);
  if (!env.DB) return response({ error: "Gagnagrunnur hefur ekki veri\xF0 tengdur." }, 503);
  if (request.method === "GET") {
    const state2 = await env.DB.prepare("SELECT version, tasks, meals FROM household WHERE id = 1").first();
    return response(state2 ? {
      version: state2.version,
      tasks: JSON.parse(state2.tasks),
      meals: JSON.parse(state2.meals)
    } : { version: 0 });
  }
  if (request.method !== "PUT") return response({ error: "A\xF0fer\xF0 \xF3heimil." }, 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
    return response({ error: "Bei\xF0ni \xF3heimil." }, 403);
  }
  const input = await request.text();
  if (input.length > 7e4) return response({ error: "Bei\xF0ni er of st\xF3r." }, 413);
  let state;
  try {
    state = JSON.parse(input);
  } catch {
    return response({ error: "\xD3gild bei\xF0ni." }, 400);
  }
  if (!validState(state)) return response({ error: "\xD3gild g\xF6gn." }, 400);
  const tasks = JSON.stringify(state.tasks.map(({ name, done }) => ({ name, done })));
  const meals = JSON.stringify(state.meals.map(({ day, name, minutes, url }) => ({ day, name, minutes, url })));
  const statement = state.version === 0 ? env.DB.prepare("INSERT INTO household VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING").bind(tasks, meals) : env.DB.prepare("UPDATE household SET version = version + 1, tasks = ?, meals = ? WHERE id = 1 AND version = ?").bind(tasks, meals, state.version);
  const result = await statement.run();
  return result.meta.changes ? response({ version: state.version + 1 }) : response({ error: "Breyting var vistu\xF0 \xFAr \xF6\xF0ru t\xE6ki." }, 409);
}

// src/worker.js
var worker_default = {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/calendar" && request.method === "GET") {
      return household(request, env);
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return onRequest({ request, env, next: () => household(request, env) });
    }
    return env.ASSETS.fetch(request);
  }
};

// dashboard-editor-entry.js
var html = `<!doctype html>
<html lang="is"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#f7f5ef" />
<meta name="robots" content="noindex,nofollow,noarchive" />
<title>Heima hj\xE1 okkur \xB7 Fj\xF6lskylduyfirlit</title>
<style>
:root{--ink:#21322c;--muted:#6b776e;--paper:#f7f5ef;--card:#fffefa;--border:#e8e5dc;--forest:#275544;--mint:#eff5ec;--amber:#9b5e24;--amberbg:#fff5e8;--blue:#365b7d;--bluebg:#eef3f8;--red:#9c4649;--redbg:#f9eded;--purple:#785a8c;--purplebg:#f5f0f8;--shadow:0 9px 27px #3243370b}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:15px;line-height:1.48}button,input{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #80bea0;outline-offset:3px}a{color:var(--forest)}.shell{max-width:1450px;margin:0 auto;padding:26px 34px 45px}.masthead{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:13px 3px 22px;border-bottom:2px solid #364e3e}.brand{display:flex;align-items:center;gap:14px}.brand-symbol{width:46px;height:46px;display:grid;place-items:center;font-family:Georgia,serif;font-size:29px;border:1px solid #95a696;border-radius:50%;color:var(--forest)}.brand-name{font-size:14px;letter-spacing:.16em;text-transform:uppercase;font-weight:780;color:var(--forest)}.brand small{display:block;font-size:11px;color:var(--muted);letter-spacing:.02em;margin-top:3px}.status{font-size:12px;color:var(--muted);text-align:right}.status strong{font-weight:650;color:var(--forest)}.tabs{display:flex;flex-wrap:wrap;gap:7px;padding:17px 0 22px}.tabs button{border:1px solid transparent;background:transparent;color:#596a5e;border-radius:99px;padding:9px 15px;font-weight:650}.tabs button:hover{background:#efeee8}.tabs button.active{background:var(--forest);color:white}.page{display:none}.page.active{display:block}.headline{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:7px 0 24px}.headline h1{font-family:Georgia,"Times New Roman",serif;font-weight:500;letter-spacing:-.045em;font-size:clamp(36px,4.5vw,63px);line-height:1.08;margin:4px 0 9px}.eyebrow{color:var(--forest);font-weight:780;font-size:11px;letter-spacing:.13em;text-transform:uppercase}.lede{margin:0;color:var(--muted);font-size:14px}.weather{border-left:1px solid var(--border);padding-left:24px;min-width:155px;text-align:right}.weather .symbol{font-size:27px;line-height:1}.weather b{display:block;font-size:15px}.weather small{color:var(--muted);font-size:11px}.grid{display:grid;grid-template-columns:minmax(0,1.22fr) minmax(0,.92fr);gap:17px}.stack{display:grid;gap:17px;align-content:start}.card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);padding:24px}.card h2{font-family:Georgia,serif;font-weight:500;font-size:26px;letter-spacing:-.03em;margin:0}.card p.sub{font-size:12px;color:var(--muted);margin:4px 0 12px}.section-head{display:flex;justify-content:space-between;gap:14px;align-items:start;margin-bottom:11px}.textbutton{border:0;color:var(--forest);background:transparent;font-weight:750;font-size:12px;padding:6px 0}.textbutton:hover{text-decoration:underline}.note{background:var(--amberbg);border:1px solid #efdcc5;padding:16px 18px;border-radius:13px;margin-bottom:18px;display:flex;gap:12px;align-items:start}.note .mark{font-size:23px}.note strong{display:block;font-size:14px}.note p{margin:4px 0 0;font-size:13px;color:#76593c}.agenda-item{display:flex;gap:13px;border-bottom:1px solid var(--border);padding:13px 0}.agenda-item:last-child{border:0}.agenda-when{flex:0 0 59px;font-weight:800;color:var(--forest);font-size:12px}.agenda-body{flex:1;min-width:0}.agenda-title{font-weight:700;font-size:15px}.agenda-note{font-size:12px;color:var(--muted);margin-top:3px}.badge{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.015em;padding:4px 7px;border-radius:7px;vertical-align:middle;margin-left:7px;color:var(--forest);background:var(--mint)}.badge.ferd{color:var(--blue);background:var(--bluebg)}.badge.lokun{color:var(--red);background:var(--redbg)}.badge.skraning{color:var(--amber);background:var(--amberbg)}.badge.foreldrar{color:var(--purple);background:var(--purplebg)}.empty{font-size:13px;color:var(--muted);margin:13px 0}.check{display:flex;gap:10px;padding:9px 0;align-items:start;border-bottom:1px solid var(--border);font-size:13px}.check:last-child{border:0}.check input{accent-color:var(--forest);width:18px;height:18px;margin:1px 0 0;flex:none}.check.done span{text-decoration:line-through;color:#9da79e}.check span{flex:1}.check button{border:0;background:transparent;color:#87938b;font-size:19px;padding:0 4px}.newtask{display:flex;gap:8px;margin-top:14px}.newtask input{border:1px solid var(--border);border-radius:9px;padding:10px;width:100%;min-width:0;background:white}.newtask button,.solid{background:var(--forest);color:white;border:0;border-radius:9px;padding:10px 14px;font-size:12px;font-weight:750}.meal-focus{background:#f1f4ec;padding:18px 20px;border-radius:13px}.meal-focus .label{font-size:11px;letter-spacing:.09em;font-weight:780;color:#5b7663;text-transform:uppercase}.meal-focus h3{font-family:Georgia,serif;font-size:24px;line-height:1.22;margin:7px 0 10px;font-weight:500}.meal-focus .small{color:var(--muted);font-size:12px}.minimeal{padding:11px 0;display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid var(--border);font-size:13px}.minimeal:last-child{border:0}.minimeal b{font-weight:700}.minimeal .when{flex:0 0 46px;color:var(--muted);font-weight:750}.bottomline{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:23px;padding:15px 3px 0;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}.page-intro{margin:12px 0 22px}.page-intro h1{font-family:Georgia,serif;font-size:38px;font-weight:500;margin:5px 0}.page-intro p{margin:0;color:var(--muted);font-size:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.weekactions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}.weekactions button,.outline{background:white;border:1px solid var(--border);border-radius:9px;padding:9px 13px;font-size:12px;font-weight:700}.weekactions strong{font-size:13px;padding:0 5px}.day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px}.day{min-height:174px;border:1px solid var(--border);border-radius:13px;background:white;padding:11px}.day.today{border-color:#a0bba1;background:#fcfdf8}.day strong{display:block;font-size:12px;text-transform:uppercase;color:var(--muted)}.day strong em{font-style:normal;font-size:24px;color:var(--ink);display:block}.dayev{background:var(--mint);border-left:3px solid var(--forest);padding:7px;border-radius:5px;font-size:11px;margin-top:9px}.dayev.ferd{background:var(--bluebg);border-color:var(--blue)}.dayev.lokun{background:var(--redbg);border-color:var(--red)}.dayev.skraning{background:var(--amberbg);border-color:var(--amber)}.dayev.foreldrar{background:var(--purplebg);border-color:var(--purple)}.menu-row{border-bottom:1px solid var(--border);padding:15px 0;display:grid;grid-template-columns:58px 1fr auto;gap:14px;align-items:center}.menu-row:last-child{border:0}.menu-row strong{display:block}.menu-row a{text-decoration:none}.menu-row a:hover{text-decoration:underline}.menu-row small{color:var(--muted)}.menu-row button{border:1px solid var(--border);border-radius:7px;background:white;padding:7px 10px;font-size:12px}.schoolitem{padding:14px 0;border-bottom:1px solid var(--border);display:flex;gap:22px}.schoolitem>span{min-width:96px;color:var(--forest);font-size:12px;font-weight:800}.schoolitem b{font-size:14px}.schoolitem p{font-size:12px;margin:4px 0 0;color:var(--muted)}.month-title{margin:20px 0 2px;text-transform:capitalize;font-size:15px}.tripitem{background:var(--bluebg);border-radius:12px;padding:19px;margin:11px 0}.tripitem h3{font-family:Georgia,serif;font-size:23px;font-weight:500;margin:2px 0 7px}.tripitem p{margin:5px 0;color:#496476;font-size:13px}.help{font-size:13px;color:var(--muted);line-height:1.6}.legal{margin-top:12px;padding:12px 14px;border-radius:10px;background:#f1efe7;color:#6b7068;font-size:12px}.warning{background:#fff4e7;border:1px solid #eed5ae;padding:12px 14px;border-radius:10px;font-size:12px;color:#7c5b33}.links{display:flex;flex-wrap:wrap;gap:9px;margin-top:13px}.links a{text-decoration:none;font-size:12px;border:1px solid var(--border);border-radius:9px;padding:10px 12px;background:white}.links a:hover{background:var(--mint)}
@media(max-width:1000px){.shell{padding:18px 22px}.grid{grid-template-columns:1fr}.day-grid{grid-template-columns:repeat(4,1fr)}.weather{min-width:120px}.two{grid-template-columns:1fr}}
@media(max-width:650px){.shell{padding:12px 12px 25px}.masthead{padding:8px 2px 17px}.brand-name{font-size:12px}.brand-symbol{width:39px;height:39px;font-size:24px}.status{font-size:10px}.tabs{padding:12px 0;gap:3px}.tabs button{padding:9px 11px;font-size:12px}.headline{align-items:start;margin:10px 0 18px}.headline h1{font-size:37px}.lede{font-size:12px}.weather{padding-left:9px;min-width:65px}.weather .symbol{font-size:21px}.weather b{font-size:11px}.weather small{display:none}.card{padding:18px}.card h2{font-size:22px}.grid,.stack{gap:12px}.day-grid{grid-template-columns:repeat(2,1fr)}.day{min-height:130px}.page-intro h1{font-size:33px}.bottomline{flex-direction:column;align-items:start}.menu-row{grid-template-columns:41px 1fr auto;gap:9px}.menu-row button{font-size:11px;padding:7px}.section-head{gap:8px}.note{padding:13px}}
@media print{.tabs,.status,.bottomline,.textbutton,.newtask,button{display:none!important}body{background:white}.shell{max-width:none}.card{break-inside:avoid;box-shadow:none}}
[hidden]{display:none!important}
</style></head><body>
<div class="shell">
<header class="masthead"><div class="brand"><div class="brand-symbol">\u2302</div><div><div class="brand-name">Heima hj\xE1 okkur</div><small>Sameiginlegt fj\xF6lskylduyfirlit</small></div></div><div class="status"><strong id="syncStatus" role="status">Verkefni og matse\xF0ill vistast \xED \xFEessum vafra.</strong><br><span id="calendarStatus">S\xFDni vista\xF0 afrit af dagskr\xE1nni.</span></div></header>
<nav class="tabs" id="tabs" aria-label="Valmynd"><button data-page="home" class="active">Yfirlit</button><button data-page="week">Dagskr\xE1</button><button data-page="food">Matse\xF0ill</button><button data-page="nursery">Marbakki</button><button data-page="journeys">Fer\xF0ir</button><button data-page="todos">Verkefni</button></nav>
<section class="page active" data-page="home">
 <div class="headline"><div><div class="eyebrow" id="headerWeek">Fj\xF6lskyldudagurinn</div><h1 id="todayLabel">G\xF3\xF0an daginn</h1><p class="lede">\xDEa\xF0 sem er \xE1 dagskr\xE1, \xFEarf a\xF0 muna og ver\xF0ur \xED matinn.</p></div><div class="weather"><div class="symbol">\u25CC</div><b>Ve\xF0ursp\xE1</b><small>Til a\xF0 tengja s\xED\xF0ar</small></div></div>
 <div class="note" id="smartNotice"><div class="mark">\u2726</div><div><strong>\xDEa\xF0 sem \xFEarf a\xF0 muna</strong><p id="smartNoticeText">Fj\xF6lskyldu\xE1minningar eru h\xE9r.</p></div></div>
 <div class="grid"><div class="stack">
 <article class="card"><div class="section-head"><div><h2>\xCD dag</h2><p class="sub">A\xF0eins atri\xF0i sem skipta m\xE1li \u2014 ekki klukkut\xEDmadagatal.</p></div><button class="textbutton" onclick="go('week')">Opna viku \u2197</button></div><div id="todayEvents"></div></article>
 <article class="card"><div class="section-head"><div><h2>Fram undan</h2><p class="sub">Helstu dagsetningar og \xFEa\xF0 sem \xFEarf a\xF0 undirb\xFAa.</p></div><button class="textbutton" onclick="go('week')">Allt dagatal \u2197</button></div><div id="importantEvents"></div></article>
 </div><div class="stack">
 <article class="card"><div class="section-head"><div><h2>\xDEarf a\xF0 muna</h2><p class="sub">Sameiginleg verkefni og undirb\xFAningur.</p></div><button class="textbutton" onclick="go('todos')">\xD6ll verkefni \u2197</button></div><div id="tasksMini"></div></article>
 <article class="card"><div class="section-head"><div><h2>Hva\xF0 er \xED matinn?</h2><p class="sub">D\xE6mimatse\xF0ill fyrir fj\xF6lskylduna.</p></div><button class="textbutton" onclick="go('food')">Vikumatse\xF0ill \u2197</button></div><div id="dinnerToday"></div><div id="nextDinners"></div><div class="links"><a href="https://kronan.is/uppskriftir" target="_blank" rel="noopener noreferrer">Uppskriftir Kr\xF3nunnar \u2197</a></div></article>
 </div></div>
</section>
<section class="page" data-page="week"><div class="page-intro"><div class="eyebrow">Dagskr\xE1in</div><h1>Vikan okkar</h1><p>Vi\xF0bur\xF0ir \xE1n klukkustundat\xF6flu. T\xEDmar birtast a\xF0eins \xFEegar \xFEeir eru skr\xE1\xF0ir \xE1 vi\xF0bur\xF0i.</p></div><div class="card"><div class="weekactions"><button onclick="moveWeek(-7)">\u2190 Fyrri vika</button><strong id="weekRange"></strong><button onclick="moveWeek(7)">N\xE6sta vika \u2192</button><button onclick="resetWeek()">\xDEessi vika</button></div><div class="day-grid" id="weekGrid"></div></div></section>
<section class="page" data-page="food"><div class="page-intro"><div class="eyebrow">Matarplani\xF0</div><h1>Vikumatse\xF0illinn</h1><p>H\xE9r m\xE1 breyta r\xE9ttum og uppskriftatenglum.</p></div><div class="two"><article class="card"><div id="menuAll"></div></article><article class="card"><h2>Innkaupin</h2><p class="sub">N\xE6sti \xE1fangi: sj\xE1lfvirkur innkaupalisti eftir sam\xFEykki matse\xF0ils.</p><div class="warning">Kr\xF3nutengingin er a\xF0gengileg \xED ChatGPT en ekki enn tengd \xFEessari HTML-s\xED\xF0u. Engin p\xF6ntun e\xF0a lifandi ver\xF0leit fer fram h\xE9r.</div><div class="links"><a target="_blank" rel="noopener noreferrer" href="https://kronan.is/snjallverslun/uppskriftir">Sko\xF0a uppskriftir \xED Snjallverslun \u2197</a></div></article></div></section>
<section class="page" data-page="nursery"><div class="page-intro"><div class="eyebrow">Marbakki \xB7 2026\u20132027</div><h1>Leiksk\xF3ladagatali\xF0</h1><p>Skipulagsdagar, skr\xE1ningardagar og vi\xF0bur\xF0ir foreldra.</p></div><article class="card"><div id="schoolList"></div></article></section>
<section class="page" data-page="journeys"><div class="page-intro"><div class="eyebrow">Fr\xED og fer\xF0al\xF6g</div><h1>Fer\xF0ir fram undan</h1><p>Yfirlit yfir fer\xF0ir og \xE1hrif \xFEeirra \xE1 fj\xF6lskyldudagskr\xE1na.</p></div><div class="two" id="tripList"></div></section>
<section class="page" data-page="todos"><div class="page-intro"><div class="eyebrow">Sameiginleg m\xE1l</div><h1>Verkefnalistinn</h1><p>H\xE6gt er a\xF0 b\xE6ta vi\xF0, breyta, haka vi\xF0 og ey\xF0a.</p></div><article class="card"><div id="allTasks"></div><div class="newtask"><input id="newTask" placeholder="B\xE6ta vi\xF0 verkefni\u2026" maxlength="180" aria-label="N\xFDtt verkefni"><button onclick="addTask()">B\xE6ta vi\xF0</button></div></article></section>
<footer class="bottomline"><span>Heima hj\xE1 okkur</span></footer>
</div>
<script>
const school = [{"start":"2027-01-04","end":"2027-01-04","title":"Skipulagsdagur \xED Marbakka","type":"lokun","note":"Leiksk\xF3li loka\xF0ur; daginn eftir heimkomu fr\xE1 Kanar\xED"}];
const trips = [{"start":"2026-12-27","end":"2027-01-03","title":"Fj\xF6lskyldufer\xF0 til Kanar\xED","type":"ferd","note":"27. desember til 3. jan\xFAar; samkv\xE6mt uppl\xFDsingum fr\xE1 fj\xF6lskyldu"},{"start":"2027-01-23","end":"2027-01-30","title":"Foreldrafer\xF0 \xE1 sk\xED\xF0i","type":"ferd","note":"23.\u201330. jan\xFAar; \xFEarf a\xF0 skipuleggja barnap\xF6ssun og akstur \xE1 \xE6fingar"}];
const calendar = [{"start":"2026-11-17","end":"2026-11-22","title":"Panama \u2013 Almar","type":"dagatal","note":"\xDAr afriti dagskr\xE1r"},{"start":"2026-11-17","end":"2026-11-17","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-11-24","end":"2026-11-24","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-12-01","end":"2026-12-01","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-12-08","end":"2026-12-08","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-12-15","end":"2026-12-15","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-12-22","end":"2026-12-22","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2026-12-29","end":"2026-12-29","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2027-01-05","end":"2027-01-05","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2027-01-12","end":"2027-01-12","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2027-01-19","end":"2027-01-19","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"},{"start":"2027-01-26","end":"2027-01-26","time":"17:15","title":"K\xF6rfubolta\xE6fing","type":"dagatal","note":"K\xE1rsnessk\xF3li, Holtager\xF0i \xB7 17:15\u201318:15 \xB7 \xFAr afriti dagskr\xE1r"}];
const defaultMeals = [{"day":"M\xE1n","name":"Hakk og spaghetti","minutes":20,"url":"https://kronan.is/uppskriftir/hakk_spaghetti"},{"day":"\xDEri","name":"Kj\xFAklingur \xED tikka masala","minutes":20,"url":"https://kronan.is/uppskriftir/kjuklingur_tikkamasala"},{"day":"Mi\xF0","name":"Plokkfiskur","minutes":50,"url":"https://kronan.is/uppskriftir/plokkfiskur"},{"day":"Fim","name":"Kj\xFAklinga Alfredo pasta","minutes":30,"url":"https://kronan.is/uppskriftir/alfredo"},{"day":"F\xF6s","name":"Heimager\xF0 p\xEDtsa","minutes":null,"url":""},{"day":"Lau","name":"Frj\xE1ls dagur / afgangar","minutes":null,"url":""},{"day":"Sun","name":"Rj\xF3ma-pest\xF3 kj\xFAklingur","minutes":30,"url":"https://kronan.is/uppskriftir/rjomapesto_kjuklingur"}];
let allEvents=[...school,...trips,...calendar].sort((a,b)=>a.start.localeCompare(b.start));
const formatDate = (s,opts={})=>new Intl.DateTimeFormat('is-IS',{timeZone:'UTC',...opts}).format(new Date(s+'T12:00:00Z'));
const dateOf=s=>new Date(s+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const plusDays=(d,n)=>new Date(d.getTime()+n*86400000);
const localDate=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Atlantic/Reykjavik',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));return \`\${o.year}-\${o.month}-\${o.day}\`};
const today=localDate();let viewDate=dateOf(today);
const dayLabels=['Sun','M\xE1n','\xDEri','Mi\xF0','Fim','F\xF6s','Lau'];
const typeLabel={ferd:'Fer\xF0',dagatal:'Dagskr\xE1',foreldrar:'Foreldrar',lokun:'Lokun',skraning:'Skr\xE1ning',annad:'Vi\xF0bur\xF0ur'};
const shortDays=['M\xE1n','\xDEri','Mi\xF0','Fim','F\xF6s','Lau','Sun'];
const xss=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function recipeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function load(k,v){try{const data=localStorage.getItem(k);return data?JSON.parse(data):v}catch(e){return v}}
let meals=load('family-menu-v2',defaultMeals);
let tasks=load('family-tasks-v2',[]);
function go(page){document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));window.scrollTo(0,0);if(page==='week')renderWeek()}
document.querySelectorAll('#tabs button').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));
function overlaps(e,d){return e.start<=d&&e.end>=d}
function prettyTime(e){return e.time||''}
function renderEvent(e,now=false){const when=now?(e.time||'Allur dagurinn'):formatDate(e.start,{day:'numeric',month:'short'});return \`<div class="agenda-item"><div class="agenda-when">\${xss(when)}</div><div class="agenda-body"><div class="agenda-title">\${xss(e.title)}<span class="badge \${xss(e.type)}">\${xss(typeLabel[e.type]||'Vi\xF0bur\xF0ur')}</span></div><div class="agenda-note">\${xss(e.note||'')}</div></div></div>\`}
function renderToday(){document.getElementById('todayLabel').textContent=formatDate(today,{weekday:'long',day:'numeric',month:'long'});const todayE=allEvents.filter(e=>overlaps(e,today));document.getElementById('todayEvents').innerHTML=todayE.length?todayE.map(e=>renderEvent(e,true)).join(''):'<p class="empty">Enginn vi\xF0bur\xF0ur skr\xE1\xF0ur \xED dag.</p>';const twoWeeks=allEvents.filter(e=>e.start>today&&e.start<=iso(plusDays(dateOf(today),14)));document.getElementById('importantEvents').innerHTML=twoWeeks.slice(0,6).map(e=>renderEvent(e)).join('')||'<p class="empty">Engir vi\xF0bur\xF0ir skr\xE1\xF0ir fram undan.</p>';
 const notice = document.getElementById('smartNotice');
 const reminder = today >= '2026-12-21' && today <= '2027-01-04'
   ? 'Skipulagsdagur \xED Marbakka 4. jan\xFAar, daginn eftir heimkomu fr\xE1 Kanar\xED. Skipuleggi\xF0 p\xF6ssun.'
   : today >= '2027-01-16' && today <= '2027-01-30'
     ? 'Skipuleggi\xF0 barnap\xF6ssun og akstur \xE1 \xE6fingar vegna sk\xED\xF0afer\xF0ar 23.\u201330. jan\xFAar.'
     : '';
 notice.hidden = !reminder;
 document.getElementById('smartNoticeText').textContent = reminder;
 const d=dateOf(today);const idx=(d.getUTCDay()+6)%7;const item=meals[idx]||{name:'Ekki \xE1kve\xF0i\xF0'};document.getElementById('dinnerToday').innerHTML=\`<div class="meal-focus"><div class="label">Kv\xF6ldmatur dagsins \xB7 tillaga</div><h3>\${xss(item.name)}</h3><div class="small">\${item.minutes?xss(item.minutes)+' m\xEDn\xFAtur \xB7 ':''}\${recipeUrl(item.url)?\`<a href="\${xss(recipeUrl(item.url))}" target="_blank" rel="noopener noreferrer">Opna uppskrift \u2197</a>\`:'Engin uppskrift tengd'}</div></div>\`;
 document.getElementById('nextDinners').innerHTML=[1,2,3].map(n=>{const di=(idx+n)%7;return \`<div class="minimeal"><span class="when">\${shortDays[di]}</span><b>\${xss((meals[di]||{}).name||'\xD3\xE1kve\xF0i\xF0')}</b></div>\`}).join('');
}
function renderTasks(){let open=tasks.filter(t=>!t.done);const mk=(t,i,full)=>\`<label class="check \${t.done?'done':''}"><input type="checkbox" onchange="toggleTask(\${i})" \${t.done?'checked':''}><span>\${xss(t.name)}</span>\${full?\`<button type="button" aria-label="Breyta verkefni" onclick="event.preventDefault();editTask(\${i})">Breyta</button><button type="button" aria-label="Ey\xF0a verkefni" onclick="event.preventDefault();deleteTask(\${i})">\xD7</button>\`:''}</label>\`;document.getElementById('tasksMini').innerHTML=open.length?open.slice(0,4).map(t=>mk(t,tasks.indexOf(t),false)).join(''):'<p class="empty">\xD6ll verkefni b\xFAin.</p>';document.getElementById('allTasks').innerHTML=tasks.map((t,i)=>mk(t,i,true)).join('')||'<p class="empty">Engin verkefni.</p>'}
let version = null;
let saving = false;
const syncStatus = document.getElementById('syncStatus');
const calendarStatus = document.getElementById('calendarStatus');

function renderShared() {
  renderTasks();
  renderMeals();
  renderToday();
}

async function refreshShared() {
  if (saving) return;
  try {
    const response = await fetch('/api/household', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const state = await response.json();
    if (saving || (version !== null && state.version < version)) return;
    if (state.version !== version && state.version > 0) {
      tasks = state.tasks;
      meals = state.meals;
      renderShared();
    }
    version = state.version;
    syncStatus.textContent = version === 0
      ? 'Fyrsta vistun deilir verkefnum og matse\xF0li \xFAr \xFEessum vafra.'
      : 'Verkefni og matse\xF0ill samstillt milli t\xE6kja.';
  } catch {
    if (version !== null) syncStatus.textContent = 'Samstilling rofna\xF0i. Reynt ver\xF0ur aftur.';
  }
}

async function refreshCalendar() {
  try {
    const response = await fetch('/api/calendar', { cache: 'no-store' });
    if (response.status === 403) {
      calendarStatus.textContent = 'Dagatalsa\xF0gangur \xF3heimill. S\xFDni vista\xF0a dagskr\xE1.';
      return;
    }
    if (!response.ok) throw new Error();
    const data = await response.json();
    const localEvents = [...school, ...trips];
    const remoteEvents = data.connected ? data.events : calendar;
    allEvents = [...localEvents, ...remoteEvents.filter(event => !localEvents.some(local =>
      local.start === event.start && local.end === event.end && local.title.toLowerCase() === event.title.toLowerCase()
    ))].sort((a, b) => a.start.localeCompare(b.start));
    calendarStatus.dataset.connected = String(data.connected);
    calendarStatus.textContent = data.connected ? 'Google Calendar uppf\xE6rt ' +
      new Intl.DateTimeFormat('is-IS', { timeStyle: 'short', timeZone: 'Atlantic/Reykjavik' }).format(new Date())
      : 'S\xFDni vista\xF0 afrit af dagskr\xE1nni.';
    renderToday();
    renderWeek();
  } catch {
    calendarStatus.textContent = 'Ekki n\xE1\xF0ist \xED Google Calendar.';
  }
}

async function saveChange(change) {
  if (saving) {
    renderShared();
    return false;
  }
  const draft = structuredClone({ tasks, meals, version });
  change(draft);
  if (version !== null) {
    saving = true;
    try {
      const response = await fetch('/api/household', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (response.status === 409) {
        saving = false;
        await refreshShared();
        syncStatus.textContent = 'Breyting barst \xFAr \xF6\xF0ru t\xE6ki. Reyndu breytinguna aftur.';
        return false;
      }
      if (!response.ok) throw new Error();
      version = (await response.json()).version;
      syncStatus.textContent = 'Verkefni og matse\xF0ill samstillt milli t\xE6kja.';
    } catch {
      renderShared();
      syncStatus.textContent = 'Vistun mist\xF3kst. Reyndu aftur.';
      return false;
    } finally {
      saving = false;
    }
  } else {
    store('family-tasks-v2', draft.tasks);
    store('family-menu-v2', draft.meals);
  }
  ({ tasks, meals } = draft);
  renderShared();
  return true;
}

function toggleTask(i) {
  return saveChange(draft => { draft.tasks[i].done = !draft.tasks[i].done; });
}

function deleteTask(i) {
  return saveChange(draft => { draft.tasks.splice(i, 1); });
}

function editTask(i) {
  const name = prompt('Breyta verkefni', tasks[i].name)?.trim();
  if (name && name.length <= 180) return saveChange(draft => { draft.tasks[i].name = name; });
}

async function addTask() {
  const input = document.getElementById('newTask');
  const name = input.value.trim();
  if (name && await saveChange(draft => { draft.tasks.push({ name, done: false }); }) && input.value.trim() === name) {
    input.value = '';
  }
}

function editMeal(i) {
  const previous = meals[i];
  const name = prompt('Hva\xF0 ver\xF0ur \xED matinn?', previous.name)?.trim();
  if (!name || name.length > 180) return;
  const link = prompt('Uppskriftasl\xF3\xF0 (valfrj\xE1ls)', name === previous.name ? previous.url : '');
  if (link === null) return;
  const url = recipeUrl(link.trim());
  if (link.trim() && !url) {
    alert('Nota\xF0u gilda HTTPS- e\xF0a HTTP-sl\xF3\xF0.');
    return;
  }
  return saveChange(draft => {
    draft.meals[i] = { ...previous, name, url, minutes: name === previous.name ? previous.minutes : null };
  });
}

function renderMeals(){document.getElementById('menuAll').innerHTML=meals.map((m,i)=>\`<div class="menu-row"><span style="font-size:12px;font-weight:800;color:var(--muted)">\${xss(m.day)}</span><div><strong>\${recipeUrl(m.url)?\`<a href="\${xss(recipeUrl(m.url))}" target="_blank" rel="noopener noreferrer">\${xss(m.name)} \u2197</a>\`:xss(m.name)}</strong><small>\${m.minutes?xss(m.minutes)+' m\xEDn.': 'D\xE6mimatse\xF0ill'}</small></div><button onclick="editMeal(\${i})">Breyta</button></div>\`).join('')}
function startMonday(d){return plusDays(d,-((d.getUTCDay()+6)%7))}
function moveWeek(n){viewDate=plusDays(viewDate,n);renderWeek()}
function resetWeek(){viewDate=dateOf(today);renderWeek()}
function renderWeek(){const m=startMonday(viewDate),end=plusDays(m,6);document.getElementById('weekRange').textContent=\`\${formatDate(iso(m),{day:'numeric',month:'short'})} \u2013 \${formatDate(iso(end),{day:'numeric',month:'short',year:'numeric'})}\`;document.getElementById('weekGrid').innerHTML=Array.from({length:7},(_,i)=>{const d=plusDays(m,i),s=iso(d);const events=allEvents.filter(e=>overlaps(e,s));return \`<div class="day \${s===today?'today':''}"><strong>\${xss(shortDays[i])}<em>\${d.getUTCDate()}</em></strong>\${events.map(e=>\`<div class="dayev \${xss(e.type)}">\${e.time?xss(e.time)+' \xB7 ':''}\${xss(e.title)}</div>\`).join('')||'<p class="empty">Engin f\xE6rsla</p>'}</div>\`}).join('')}
function renderSchool(){const upcoming=school.filter(e=>e.end>=today);let month='';let html='';for(const e of upcoming){const m=e.start.slice(0,7);if(m!==month){month=m;html+=\`<h3 class="month-title">\${formatDate(m+'-01',{month:'long',year:'numeric'})}</h3>\`}html+=\`<div class="schoolitem"><span>\${formatDate(e.start,{day:'numeric',month:'short'})}\${e.start===e.end?'':' \u2013 '+formatDate(e.end,{day:'numeric',month:'short'})}</span><div><b>\${xss(e.title)} <span class="badge \${xss(e.type)}">\${xss(typeLabel[e.type]||'Vi\xF0bur\xF0ur')}</span></b><p>\${xss(e.note||'')}</p></div></div>\`}document.getElementById('schoolList').innerHTML=html||'<p class="empty">Engir leiksk\xF3lavi\xF0bur\xF0ir skr\xE1\xF0ir.</p>'}
function renderTrips(){document.getElementById('tripList').innerHTML=trips.map(t=>\`<article class="card"><div class="tripitem"><div class="eyebrow">Fer\xF0</div><h3>\${xss(t.title)}</h3><p>\${formatDate(t.start,{day:'numeric',month:'long',year:'numeric'})} \u2013 \${formatDate(t.end,{day:'numeric',month:'long',year:'numeric'})}</p></div><p class="help">\${xss(t.note)}</p></article>\`).join('')||'<p class="empty">Engar fer\xF0ir skr\xE1\xF0ar.</p>'}
renderShared();renderWeek();renderSchool();renderTrips();
if (location.protocol === 'https:' || location.protocol === 'http:') {
  refreshShared();
  refreshCalendar();
  setInterval(refreshShared, 15000);
  setInterval(refreshCalendar, 5 * 60000);
}
<\/script></body></html>`;
var ASSETS = {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD" || pathname !== "/" && pathname !== "/index.html") {
      return new Response("Sl\xF3\xF0 fannst ekki.", { status: 404 });
    }
    return new Response(request.method === "HEAD" ? null : html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  }
};
var dashboard_editor_entry_default = {
  fetch(request, env) {
    return worker_default.fetch(request, { ...env, ASSETS });
  }
};
export {
  dashboard_editor_entry_default as default
};
