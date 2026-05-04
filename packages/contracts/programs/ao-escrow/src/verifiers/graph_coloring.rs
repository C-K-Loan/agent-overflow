use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Type 7: Graph K-coloring verifier.
///
/// Config binary format (compact, fits in 64 bytes):
///   [0]: numVertices (u8, max 15)
///   [1]: numColors   (u8, max 8)
///   [2]: numEdges    (u8, max 30)
///   [3..]: edges as pairs [u:u8, v:u8] (0-indexed vertex numbers)
///
/// Solution format: comma-separated color integers (0-indexed), one per vertex.
///   "0,1,0,2,1" means vertex0=color0, vertex1=color1, etc.
pub fn verify(config: &[u8], solution: &str) -> Result<()> {
    require!(config.len() >= 3, EscrowError::InvalidConfig);

    let num_vertices = config[0] as usize;
    let num_colors   = config[1] as usize;
    let num_edges    = config[2] as usize;

    require!(num_vertices >= 1 && num_vertices <= 15, EscrowError::InvalidConfig);
    require!(num_colors >= 1 && num_colors <= 8,      EscrowError::InvalidConfig);
    require!(config.len() >= 3 + num_edges * 2,       EscrowError::InvalidConfig);

    // Parse solution: comma-separated color per vertex
    let parts: Vec<&str> = solution.split(',').collect();
    require!(parts.len() == num_vertices, EscrowError::VerificationFailed);

    let mut coloring = vec![0usize; num_vertices];
    for (i, part) in parts.iter().enumerate() {
        let color: usize = part
            .trim()
            .parse::<u8>()
            .map_err(|_| error!(EscrowError::VerificationFailed))? as usize;
        require!(color < num_colors, EscrowError::VerificationFailed);
        coloring[i] = color;
    }

    // Check every edge — no two adjacent vertices may share a color
    for i in 0..num_edges {
        let u = config[3 + i * 2]     as usize;
        let v = config[3 + i * 2 + 1] as usize;
        require!(u < num_vertices && v < num_vertices, EscrowError::InvalidConfig);
        require!(coloring[u] != coloring[v], EscrowError::VerificationFailed);
    }

    Ok(())
}

/// Build compact binary config. Returns None if exceeds VERIFIER_CONFIG_SIZE.
pub fn encode_config(num_vertices: u8, num_colors: u8, edges: &[(u8, u8)]) -> Option<Vec<u8>> {
    let mut buf = vec![num_vertices, num_colors, edges.len() as u8];
    for &(u, v) in edges {
        buf.push(u);
        buf.push(v);
    }
    if buf.len() > crate::state::VERIFIER_CONFIG_SIZE {
        return None;
    }
    Some(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_triangle_3color() {
        // Triangle graph: vertices 0,1,2, edges (0,1),(1,2),(0,2) — needs exactly 3 colors
        let cfg = encode_config(3, 3, &[(0, 1), (1, 2), (0, 2)]).unwrap();
        assert!(verify(&cfg, "0,1,2").is_ok());
        assert!(verify(&cfg, "2,0,1").is_ok());
    }

    #[test]
    fn test_triangle_2color_fails() {
        // Triangle can't be 2-colored
        let cfg = encode_config(3, 2, &[(0, 1), (1, 2), (0, 2)]).unwrap();
        assert!(verify(&cfg, "0,1,0").is_err()); // (0,2) conflict
        assert!(verify(&cfg, "0,1,1").is_err()); // (1,2) conflict
    }

    #[test]
    fn test_path_graph_2color() {
        // Path 0-1-2-3: bipartite, 2-colorable
        let cfg = encode_config(4, 2, &[(0, 1), (1, 2), (2, 3)]).unwrap();
        assert!(verify(&cfg, "0,1,0,1").is_ok());
        assert!(verify(&cfg, "1,0,1,0").is_ok());
        assert!(verify(&cfg, "0,0,0,0").is_err());
    }

    #[test]
    fn test_out_of_range_color() {
        let cfg = encode_config(2, 2, &[(0, 1)]).unwrap();
        assert!(verify(&cfg, "0,2").is_err()); // color 2 not in [0,1]
    }

    #[test]
    fn test_wrong_vertex_count() {
        let cfg = encode_config(3, 3, &[(0, 1)]).unwrap();
        assert!(verify(&cfg, "0,1").is_err());       // too few
        assert!(verify(&cfg, "0,1,2,0").is_err());  // too many
    }
}
