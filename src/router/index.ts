import { useBlockchain } from "@/stores";
import { createRouter, createWebHistory } from "vue-router";
// @ts-ignore
import { setupLayouts } from "virtual:generated-layouts";
// @ts-ignore
import routes from "~pages";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [...setupLayouts(routes)],

  // ✅ ADD THIS (global fix for whole project)
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return {
      top: 0,
      behavior: "smooth",
    };
  },
});

//update current blockchain
router.beforeEach((to) => {
    const { chain } = to.params
    if(chain){
      const blockchain = useBlockchain()
      if(chain !== blockchain.chainName) {
        blockchain.setCurrent(chain.toString())
      }
    } 
})

// Docs: https://router.vuejs.org/guide/advanced/navigation-guards.html#global-before-guards

export default router;