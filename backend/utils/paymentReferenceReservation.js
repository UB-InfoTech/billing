const PaymentReference=require("../models/PaymentReference");

function createPaymentReferenceConflict(error) {
  const conflict=new Error("Payment reference already exists. Use a different reference.");
  conflict.status=409;
  if(error)conflict.cause=error;
  return conflict;
}

function normalizeReference(value) {
  return String(value||"").trim();
}

async function reservePaymentReference({createdBy,reference,kind,session}) {
  const normalized=normalizeReference(reference);
  if(!normalized)return null;
  if(!createdBy)throw new TypeError("Business ownership is required to reserve a payment reference.");
  if(!["single","bulk","historical"].includes(kind))throw new TypeError("Invalid payment reference type.");

  const reservation=new PaymentReference({createdBy,reference:normalized,kind});
  try {
    await reservation.save(session?{session}:undefined);
    return reservation._id;
  } catch(error) {
    if(error?.code===11000)throw createPaymentReferenceConflict(error);
    throw error;
  }
}

/**
 * Preserve a reference found on an older payment before editing/deleting it.
 * In standalone mode, a concurrent successful reservation can be reread;
 * inside a transaction, duplicate-key conflicts must abort and be retried.
 */
async function ensurePaymentReferenceReserved({createdBy,reference,kind="historical",session}) {
  const normalized=normalizeReference(reference);
  if(!normalized)return null;

  const query=PaymentReference.findOne({createdBy,reference:normalized}).select("_id");
  if(session)query.session(session);
  const existing=await query.lean();
  if(existing)return existing._id;

  try {
    return await reservePaymentReference({createdBy,reference:normalized,kind,session});
  } catch(error) {
    if(error?.status!==409||session)throw error;
    const retry=PaymentReference.findOne({createdBy,reference:normalized}).select("_id");
    const found=await retry.lean();
    if(found)return found._id;
    throw error;
  }
}

async function releasePaymentReference({reservationId,createdBy}) {
  if(!reservationId||!createdBy)return;
  await PaymentReference.deleteOne({_id:reservationId,createdBy});
}

module.exports={
  reservePaymentReference,
  ensurePaymentReferenceReserved,
  releasePaymentReference,
  createPaymentReferenceConflict,
  normalizeReference
};
