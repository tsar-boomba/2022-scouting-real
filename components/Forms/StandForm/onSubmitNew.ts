import { CreateStandForm } from '@/models/StandForm';
import { UserI } from '@/models/User';
import { SubmitHandler, UseFormReset } from 'react-hook-form';
import { computeScore } from './computeScore';
import { deleteLocalSave, saveLocal } from './saveLocal';

type StandFormOnSubmit = (
	create: boolean,
	user: UserI | undefined,
	reset: UseFormReset<CreateStandForm>,
	isOnline: boolean,
	setSubmitting: React.Dispatch<React.SetStateAction<'' | 'fetching' | 'done'>>,
	alliance: string,
) => SubmitHandler<CreateStandForm>;

// returns dif function depending on whether the form is for updating or creation
export const onSubmit: StandFormOnSubmit = (
	create,
	user,
	reset,
	isOnline,
	setSubmitting,
	alliance,
) => {
	const onCreate: SubmitHandler<CreateStandForm> = (data) => {
		if (data.climb === true) {
			data.park = false;
		}
		if (!user || user.banned) return;
		if (isOnline) {
			setSubmitting('fetching');
			fetch('/api/forms/stand', {
				method: 'POST',
				body: JSON.stringify({
					...data,
					scouter: user._id,
					scoutScore: computeScore(data),
					alliance: alliance === '' ? 'none' : alliance,
				}),
			}).then(async (res) => {
				setSubmitting('done');
				if (res.ok) reset();
			});
			deleteLocalSave(data.matchNumber, data.teamNumber);
		} else {
			setSubmitting('fetching');
			// if user is offline
			saveLocal(data);
			alert("Saved locally. You can submit your form when you are online.")
			reset();
		}
	};

	const onUpdate: SubmitHandler<CreateStandForm> = (data) => {
		if (!user || user.banned || !user.administrator) return;
		data.scoutScore = computeScore(data);
		setSubmitting('fetching');
		fetch('/api/forms/stand', {
			method: 'PATCH',
			body: JSON.stringify({
				...data,
				scoutScore: computeScore(data),
				alliance,
			}),
		}).then(() => setSubmitting('done'));
	};

	return create ? onCreate : onUpdate;
};
