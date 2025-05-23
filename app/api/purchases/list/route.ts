import { prismaClient } from "@/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { unauthorized } from "../../(utils)/responses";
import { z } from "zod";

// Validamos que el recordType sea uno de los valores permitidos
const purchaseSchema = z.object({
  recordType: z.enum(["Ventas", "Compras"]),
});

// Endpoint para obtener las compras o ventas
export async function GET(req: NextRequest) {
  const token = await getToken({ req });

  if (!token || !token.sub) return unauthorized();

  const user = await prismaClient.user.findUnique({
    where: {
      id: parseInt(token.sub),
    },
  });

  if (!user) return unauthorized();
  if (!user.companyId) return unauthorized("No pertenece a ninguna empresa");

  // Parseamos y validamos el parámetro desde la query
  const { searchParams } = new URL(req.url);
  const recordType = searchParams.get("recordType") as "Ventas" | "Compras";

  // Validación del tipo de recordType usando zod
  const { success, error } = purchaseSchema.safeParse({ recordType });

  if (!success) {
    return NextResponse.json({ error: error?.issues }, { status: 400 });
  }

  let purchases;
  let purchasesWithCounts;
  if (recordType === "Ventas") {
    purchases = await prismaClient.purchase.findMany({
      where: {
        auction: {
          companySellerId: user.companyId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        auction: {
          include: {
            companySeller: true,
            waste: {
              include: {
                unitType: true,
                wasteType: true,
              },
            },
          },
        },

        offer: {
          include: {
            companyBuyer: {
              include: {
                offers: true,
                auctions: true,
              },
            }
          },
        },
      },
    });
  purchasesWithCounts = await Promise.all(
    purchases.map(async (purchase) => {
      const countOffers = purchase.offer.companyBuyer.offers.length
  
      const countSales = await prismaClient.purchase.count({
        where: {
          auction: {
            companySellerId: purchase.offer.companyBuyerId,
          },
        },
      });
  
      const countPurchases = await prismaClient.purchase.count({
        where: {
          offer: {
            companyBuyerId: purchase.offer.companyBuyerId,
          },
        },
      });
  
      const countAuctions = purchase.offer.companyBuyer.auctions.length
  
      return {
        ...purchase,
        counts: {
          countOffers,
          countSales,
          countPurchases,
          countAuctions,
        },
      };
    })
  );
  } else if (recordType === "Compras") {
    purchases = await prismaClient.purchase.findMany({
      where: {
        offer: {
          companyBuyerId: user.companyId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        auction: {
          include: {
            companySeller: {
              include: {
                offers: true,
                auctions: true,
              },
            },
            waste: {
              include: {
                unitType: true,
                wasteType: true,
              },
            },
          },
        },

        offer: {
          include: {
            companyBuyer: true,
          },
        },
      },
    });
  purchasesWithCounts = await Promise.all(
    purchases.map(async (purchase) => {
      const countOffers = purchase.auction.companySeller.offers.length
  
      const countSales = await prismaClient.purchase.count({
        where: {
          auction: {
            companySellerId: purchase.auction.companySellerId,
          },
        },
      });
  
      const countPurchases = await prismaClient.purchase.count({
        where: {
          offer: {
            companyBuyerId: purchase.auction.companySellerId,
          },
        },
      });
  
      const countAuctions = purchase.auction.companySeller.auctions.length
  
      return {
        ...purchase,
        counts: {
          countOffers,
          countSales,
          countPurchases,
          countAuctions,
        },
      };
    })
  );
  }
  // Verificamos si hay resultados
  if (!purchasesWithCounts) {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  return NextResponse.json(purchasesWithCounts, { status: 200 });
}