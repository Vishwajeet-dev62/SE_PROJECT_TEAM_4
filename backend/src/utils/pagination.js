const { ApiError } = require("../errors/apiError");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query = {}) {
  const page = parseParameter("page", query.page, DEFAULT_PAGE, Number.MAX_SAFE_INTEGER);
  const limit = parseParameter("limit", query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Invalid page",
      { page: "Offset is outside the supported range" },
    );
  }

  return {
    page,
    limit,
    offset,
  };
}

function parseParameter(name, value, fallback, maximum) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Invalid ${name}`,
      { [name]: "Must be a positive integer" },
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Invalid ${name}`,
      { [name]: `Must be between 1 and ${maximum}` },
    );
  }
  return parsed;
}

function collectionResponse(data, pagination, total) {
  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: Number(total),
    },
  };
}

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  collectionResponse,
  parsePagination,
};
