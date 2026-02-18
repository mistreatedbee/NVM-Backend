function getPaginationParams(query = {}, defaults = {}) {
  const page = Math.max(parseInt(query.page, 10) || defaults.page || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || defaults.limit || 20, 1),
    defaults.maxLimit || 100
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginatedResult({ data, page, limit, total }) {
  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1
  };
}

module.exports = {
  getPaginationParams,
  paginatedResult
};
