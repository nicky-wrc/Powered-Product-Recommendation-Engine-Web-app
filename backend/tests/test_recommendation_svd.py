"""Guards sklearn TruncatedSVD component bounds (regression for small matrices)."""

from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD


def _max_components(mat: csr_matrix) -> int:
    return min(16, min(mat.shape[0], mat.shape[1]) - 1)


def test_truncated_svd_two_by_two():
    mat = csr_matrix([[1.0, 0.0], [0.0, 1.0]], shape=(2, 2))
    max_n = _max_components(mat)
    assert max_n == 1
    TruncatedSVD(n_components=max_n, random_state=42).fit_transform(mat)


def test_truncated_svd_small_tall_matrix():
    mat = csr_matrix([[1.0, 0.0, 2.0], [0.0, 1.0, 0.0]], shape=(2, 3))
    max_n = _max_components(mat)
    assert max_n == 1
    TruncatedSVD(n_components=max_n, random_state=42).fit_transform(mat)
