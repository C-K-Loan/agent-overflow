use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Type 6: Boolean SAT verifier (CNF).
///
/// Config binary format (compact, fits in 64 bytes):
///   [0]: numVars  (u8, max 20)
///   [1]: numClauses (u8, max 12)
///   For each clause:
///     [i]: numLiterals (u8, max 5)
///     [i+1..]: literals as i8 (positive = var, negative = negation, 1-indexed)
///
/// Solution format: comma-separated 0/1 string, one per variable (1-indexed).
///   "1,0,1" means x1=true, x2=false, x3=true.
pub fn verify(config: &[u8], solution: &str) -> Result<()> {
    require!(config.len() >= 2, EscrowError::InvalidConfig);

    let num_vars = config[0] as usize;
    let num_clauses = config[1] as usize;

    require!(num_vars >= 1 && num_vars <= 20, EscrowError::InvalidConfig);
    require!(num_clauses >= 1 && num_clauses <= 12, EscrowError::InvalidConfig);

    // Parse solution: comma-separated 0/1, 1-indexed (assignment[0] unused)
    let mut assignment = vec![false; num_vars + 1];
    let parts: Vec<&str> = solution.split(',').collect();
    require!(parts.len() == num_vars, EscrowError::VerificationFailed);

    for (i, part) in parts.iter().enumerate() {
        let val = part.trim();
        require!(val == "0" || val == "1", EscrowError::VerificationFailed);
        assignment[i + 1] = val == "1";
    }

    // Decode and check each clause
    let mut pos = 2usize;
    for _ in 0..num_clauses {
        require!(pos < config.len(), EscrowError::InvalidConfig);
        let num_lits = config[pos] as usize;
        pos += 1;

        require!(num_lits >= 1 && num_lits <= 5, EscrowError::InvalidConfig);
        require!(pos + num_lits <= config.len(), EscrowError::InvalidConfig);

        let mut clause_satisfied = false;
        for j in 0..num_lits {
            let lit = config[pos + j] as i8;
            require!(lit != 0, EscrowError::InvalidConfig);

            let var_idx = lit.unsigned_abs() as usize;
            require!(var_idx >= 1 && var_idx <= num_vars, EscrowError::InvalidConfig);

            let var_val = assignment[var_idx];
            let lit_true = if lit > 0 { var_val } else { !var_val };

            if lit_true {
                clause_satisfied = true;
                break;
            }
        }

        require!(clause_satisfied, EscrowError::VerificationFailed);
        pos += num_lits;
    }

    Ok(())
}

/// Build compact binary config from numVars and clauses (Vec<Vec<i8>>).
/// Returns None if the encoding exceeds MAX_SAT_CONFIG_SIZE bytes.
pub fn encode_config(num_vars: u8, clauses: &[Vec<i8>]) -> Option<Vec<u8>> {
    let mut buf = vec![num_vars, clauses.len() as u8];
    for clause in clauses {
        buf.push(clause.len() as u8);
        for &lit in clause {
            buf.push(lit as u8);
        }
    }
    if buf.len() > crate::state::VERIFIER_CONFIG_SIZE {
        return None;
    }
    Some(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(num_vars: u8, clauses: &[&[i8]]) -> Vec<u8> {
        let vecs: Vec<Vec<i8>> = clauses.iter().map(|c| c.to_vec()).collect();
        encode_config(num_vars, &vecs).expect("config too large")
    }

    #[test]
    fn test_simple_sat_correct() {
        // (x1 ∨ x2) ∧ (¬x1 ∨ x2)  →  x2=true satisfies both
        let cfg = make_config(2, &[&[1, 2], &[-1, 2]]);
        // x1=false, x2=true → "0,1"
        assert!(verify(&cfg, "0,1").is_ok());
    }

    #[test]
    fn test_simple_sat_wrong() {
        // (x1) ∧ (¬x1)  — UNSAT; any assignment fails
        let cfg = make_config(1, &[&[1], &[-1]]);
        assert!(verify(&cfg, "1").is_err());
        assert!(verify(&cfg, "0").is_err());
    }

    #[test]
    fn test_three_var_sat() {
        // (x1 ∨ x2 ∨ ¬x3) ∧ (¬x1 ∨ x3) ∧ (x2 ∨ ¬x3)
        // x1=true, x2=true, x3=true → satisfies all
        let cfg = make_config(3, &[&[1, 2, -3], &[-1, 3], &[2, -3]]);
        assert!(verify(&cfg, "1,1,1").is_ok());
    }

    #[test]
    fn test_wrong_num_vars() {
        let cfg = make_config(2, &[&[1, 2]]);
        assert!(verify(&cfg, "1").is_err()); // too few
        assert!(verify(&cfg, "1,0,0").is_err()); // too many
    }
}
