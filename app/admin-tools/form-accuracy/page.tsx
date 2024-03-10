import { connectToDbB } from '@/middleware/connect-db';
import StandForm, { StandFormI } from '@/models/StandForm';
import { getEventMatches } from '@/lib/fetchers/tba';
import { TBAEventKey, TBATeamKey } from '@/lib/types/tba/utilTypes';
import verifyAdmin from '@/middleware/app-router/verify-user';
import { cookies } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

const groupMatchesAgg = [
	{
		$group: {
			_id: {
				matchNumber: '$matchNumber',
				teamNumber: '$teamNumber',
			},
			forms: { $push: '$$ROOT' },
		},
	},
];

const groupMatchesAllianceAgg = [
	{
		$group: {
			_id: {
				matchNumber: '$matchNumber',
				alliance: '$alliance',
			},
			forms: { $push: '$$ROOT' },
		},
	},
];

interface GroupedForms {
	_id: {
		matchNumber: number;
		teamNumber: number;
	};
	forms: StandFormI[];
}

interface GroupedAllianceForms {
	_id: {
		matchNumber: number;
		alliance: string;
	};
	forms: StandFormI[];
}

function verifyFormEquality(ref: StandFormI, comp: StandFormI) {
	if (ref.scoutScore !== comp.scoutScore) return false;
	const keys: (keyof StandFormI)[] = [
		'autoAmpNotes',
		'autoSpeakerNotes',
		'autoNotesMissed',
		'teleopAmpNotes',
		'teleopSpeakerNotes',
		'teleopAmplifiedSpeakerNotes',
		'teleopNotesMissed',
		'shuttleNotes',
		'trapNotes',
		'trapAttempts',
		'numberOnChain',
	];
	for (let key of keys) {
		if (ref[key] !== comp[key]) {
			return false;
		}
	}
	return true;
}

export default async function VerifyFormAccuracyPage() {
	const access_token = cookies().get('access_token')?.value;
	const isAdmin = await verifyAdmin(access_token);
	if (!isAdmin) {
		return <div>You aren't authorized</div>;
	}
	await connectToDbB();

	if (!global.compKey.compKey) {
		return <div>Current competition not set</div>;
	}

	const standFormGroups = await StandForm.aggregate<GroupedForms>(groupMatchesAgg);
	const allianceGroups = await StandForm.aggregate<GroupedAllianceForms>(groupMatchesAllianceAgg);
	allianceGroups.forEach((allianceGroup) => {
		if (allianceGroup.forms.length != 6) return;
		const sortedAllianceGroups = allianceGroup.forms.sort(
			(a, b) => a.teamNumber - b.teamNumber,
		);
		const standFormGroups2: GroupedForms[] = [];
		for (let i = 0; i < 6; i += 2) {
			standFormGroups2.push({
				_id: {
					matchNumber: allianceGroup._id.matchNumber,
					teamNumber: sortedAllianceGroups[i].teamNumber,
				},
				forms: [sortedAllianceGroups[i], sortedAllianceGroups[i+1]],
			});
		}
	});
	// get completed tba matches

	const tbaMatchesData = await getEventMatches(global.compKey.compKey as TBAEventKey, true);
	const matchNumMap = Object.fromEntries(
		tbaMatchesData.map((match) => [match.match_number.toString(), match]),
	);

	const mismatchedTeamMatches: { teamNumber: number; matchNumber: number }[] = [];
	const mismatchedAutoLine: { teamNumber: number; matchNumber: number; _id: string }[] = [];
	const mismatchedEndgameStatus: { teamNumber: number; matchNumber: number; _id: string }[] = [];
	standFormGroups.forEach((standFormGroup) => {
		if (standFormGroup.forms.length > 1) {
			const reference = standFormGroup.forms[0];
			standFormGroup.forms.slice(1).forEach((form) => {
				if (!verifyFormEquality(reference, form)) {
					mismatchedTeamMatches.push({ ...standFormGroup._id });
					return;
				}
			});
		}
		const tbaMatchData = matchNumMap[standFormGroup._id.matchNumber];
		if (!tbaMatchData.score_breakdown.blue || !tbaMatchData.score_breakdown.red) return;
		if (tbaMatchData) {
			let alliance: 'blue' | 'red' = 'blue';
			let position = tbaMatchData.alliances.blue.team_keys.indexOf(
				('frc' + standFormGroup._id.teamNumber) as TBATeamKey,
			);
			if (position === -1) {
				alliance = 'red';
				position = tbaMatchData.alliances.red.team_keys.indexOf(
					('frc' + standFormGroup._id.teamNumber) as TBATeamKey,
				);
			}
			const crossedAuto =
				tbaMatchData.score_breakdown[alliance][
					('autoLineRobot' + (position + 1)) as
						| 'autoLineRobot1'
						| 'autoLineRobot2'
						| 'autoLineRobot3'
				];
			const EndgameStatus =
				tbaMatchData.score_breakdown[alliance][
					('endGameRobot' + (position + 1)) as
						| 'endGameRobot1'
						| 'endGameRobot2'
						| 'endGameRobot3'
				];
			standFormGroup.forms.forEach((form) => {
				if (
					(form.initiationLine && crossedAuto === 'No') ||
					(!form.initiationLine && crossedAuto === 'Yes')
				) {
					mismatchedAutoLine.push({
						_id: form._id,
						matchNumber: standFormGroup._id.matchNumber,
						teamNumber: standFormGroup._id.teamNumber,
					});
				}
				if (
					(form.climb && (EndgameStatus === 'Parked' || EndgameStatus === 'None')) ||
					(form.park && EndgameStatus !== 'Parked') ||
					(!form.park && !form.climb && EndgameStatus !== 'None')
				) {
					mismatchedEndgameStatus.push({
						_id: form._id,
						matchNumber: standFormGroup._id.matchNumber,
						teamNumber: standFormGroup._id.teamNumber,
					});
				}
			});
		}
	});

	mismatchedAutoLine.sort((a, b) => a.matchNumber - b.matchNumber);
	mismatchedEndgameStatus.sort((a, b) => a.matchNumber - b.matchNumber);

	return (
		<main className='mx-auto mt-8 max-w-5xl px-4'>
			<section>
				<h2 className='typography'>Mismatched Forms</h2>
				<div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
					{mismatchedTeamMatches.map((i) => {
						return (
							<Card key={`${i.teamNumber} + ${i.matchNumber}`}>
								<CardHeader className='p-6'>
									<CardTitle>Match {i.matchNumber}</CardTitle>
								</CardHeader>
								<CardContent className='pt-0'>Team {i.teamNumber}</CardContent>
							</Card>
						);
					})}
				</div>
			</section>
			<section className='mt-4'>
				<h2 className='typography'>Mismatched Auto Line with TBA</h2>
				<div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
					{mismatchedAutoLine.map((i) => {
						return (
							<Card key={`${i.teamNumber} + ${i.matchNumber}`}>
								<CardHeader className='p-6'>
									<CardTitle>Match {i.matchNumber}</CardTitle>
								</CardHeader>
								<CardContent className='pt-0'>
									Team {i.teamNumber}
									<br />
									<Link
										className='text-primary hover:underline'
										href={`/records/stand-forms/${i._id}`}
										target='_blank'
									>
										View Form
									</Link>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</section>
			<section className='mt-4'>
				<h2 className='typography'>Mismatched Endgame Status with TBA</h2>
				<div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
					{mismatchedEndgameStatus.map((i) => {
						return (
							<Card key={`${i.teamNumber} + ${i.matchNumber}`}>
								<CardHeader className='p-6'>
									<CardTitle>Match {i.matchNumber}</CardTitle>
								</CardHeader>
								<CardContent className='pt-0'>
									Team {i.teamNumber}
									<br />
									<Link
										className='text-primary hover:underline'
										href={`/records/stand-forms/${i._id}`}
										target='_blank'
									>
										View Form
									</Link>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</section>
		</main>
	);
}
