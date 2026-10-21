#![no_std]
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String};
#[contract]
pub struct TestToken;

fn put(env: &Env, address: &Address, amount: i128) {
    env.storage().persistent().set(address, &amount);
    env.storage()
        .persistent()
        .extend_ttl(address, 100_000, 500_000);
}

#[contractimpl]
impl TestToken {
    pub fn __constructor(env: Env) {
        assert_eq!(
            env.ledger().network_id(),
            BytesN::from_array(
                &env,
                &[
                    206, 224, 48, 45, 89, 132, 77, 50, 189, 202, 145, 92, 130, 3, 221, 68, 179, 63,
                    187, 126, 220, 25, 5, 30, 163, 122, 190, 223, 40, 236, 212, 114
                ]
            ),
            "testnet only"
        );
        env.storage().instance().extend_ttl(100_000, 500_000);
    }
    pub fn name(env: Env) -> String {
        String::from_str(&env, "AccordBridge Test Token - No Value")
    }
    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "ABUSD")
    }
    pub fn decimals(_env: Env) -> u32 {
        7
    }
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
    // Deliberately permissionless and capped per call: a worthless development token.
    pub fn faucet(env: Env, to: Address) {
        put(
            &env,
            &to,
            Self::balance(env.clone(), to.clone())
                .checked_add(1000_0000000)
                .unwrap(),
        );
    }
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount >= 0, "negative transfer");
        let balance = Self::balance(env.clone(), from.clone());
        assert!(balance >= amount, "insufficient balance");
        if from != to {
            put(&env, &from, balance - amount);
            put(
                &env,
                &to,
                Self::balance(env.clone(), to.clone())
                    .checked_add(amount)
                    .unwrap(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    #[test]
    fn faucet_and_transfers_preserve_balances_and_require_auth() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| {
            ledger.network_id = [
                206, 224, 48, 45, 89, 132, 77, 50, 189, 202, 145, 92, 130, 3, 221, 68, 179, 63,
                187, 126, 220, 25, 5, 30, 163, 122, 190, 223, 40, 236, 212, 114,
            ]
        });
        let id = env.register(TestToken, ());
        let token = TestTokenClient::new(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        token.faucet(&alice);
        assert_eq!(token.balance(&alice), 10_000_000_000);
        assert!(token.try_transfer(&alice, &bob, &1).is_err());
        env.mock_all_auths();
        assert!(token.try_transfer(&alice, &bob, &-1).is_err());
        assert!(token.try_transfer(&alice, &bob, &10_000_000_001).is_err());
        token.transfer(&alice, &bob, &1_500_000_000);
        token.transfer(&bob, &bob, &1_500_000_000);
        assert_eq!(token.balance(&alice), 8_500_000_000);
        assert_eq!(token.balance(&bob), 1_500_000_000);
    }

    fn fixture() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.ledger().with_mut(|ledger| {
            ledger.network_id = [
                206, 224, 48, 45, 89, 132, 77, 50, 189, 202, 145, 92, 130, 3, 221, 68, 179, 63,
                187, 126, 220, 25, 5, 30, 163, 122, 190, 223, 40, 236, 212, 114,
            ];
        });
        let id = env.register(TestToken, ());
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        (env, id, alice, bob)
    }

    #[test]
    fn faucet_overflow_preserves_balance_at_the_boundary() {
        let (env, id, alice, _) = fixture();
        let token = TestTokenClient::new(&env, &id);
        env.as_contract(&id, || put(&env, &alice, i128::MAX - 10_000_000_000));
        token.faucet(&alice);
        assert_eq!(token.balance(&alice), i128::MAX);
        assert!(token.try_faucet(&alice).is_err());
        assert_eq!(token.balance(&alice), i128::MAX);
    }

    #[test]
    fn destination_overflow_rolls_back_sender_debit() {
        let (env, id, alice, bob) = fixture();
        let token = TestTokenClient::new(&env, &id);
        env.as_contract(&id, || {
            put(&env, &alice, 2);
            put(&env, &bob, i128::MAX - 1);
        });
        env.mock_all_auths();
        assert!(token.try_transfer(&alice, &bob, &2).is_err());
        assert_eq!(token.balance(&alice), 2);
        assert_eq!(token.balance(&bob), i128::MAX - 1);
        token.transfer(&alice, &bob, &1);
        assert_eq!(token.balance(&alice), 1);
        assert_eq!(token.balance(&bob), i128::MAX);
        assert!(token.try_transfer(&alice, &bob, &1).is_err());
        assert_eq!(token.balance(&alice), 1);
        assert_eq!(token.balance(&bob), i128::MAX);
    }

    #[test]
    fn zero_and_self_transfers_require_auth_and_never_mint() {
        let (env, id, alice, bob) = fixture();
        let token = TestTokenClient::new(&env, &id);
        env.as_contract(&id, || put(&env, &alice, i128::MAX));
        assert!(token.try_transfer(&alice, &bob, &0).is_err());
        assert!(token.try_transfer(&alice, &alice, &0).is_err());
        assert!(token.try_transfer(&alice, &alice, &i128::MAX).is_err());
        env.mock_all_auths();
        token.transfer(&alice, &bob, &0);
        token.transfer(&alice, &alice, &0);
        token.transfer(&alice, &alice, &i128::MAX);
        token.transfer(&bob, &bob, &0);
        assert!(token.try_transfer(&bob, &bob, &1).is_err());
        assert!(token.try_transfer(&alice, &alice, &-1).is_err());
        assert_eq!(token.balance(&alice), i128::MAX);
        assert_eq!(token.balance(&bob), 0);
    }

    #[test]
    #[should_panic(expected = "testnet only")]
    fn rejects_other_networks() {
        Env::default().register(TestToken, ());
    }
}
