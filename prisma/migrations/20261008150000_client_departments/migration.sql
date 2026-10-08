-- Which departments handle each client. Every existing client came from the media planner, so they start as Media clients.
ALTER TABLE "clients" ADD COLUMN "departments" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "clients" SET "departments" = ARRAY['media']::TEXT[];
